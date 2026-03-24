import { getPostType, proxyCdnUrl, resolvePostMedia, type UnifiedCreator, type UnifiedPost } from "./api/helpers.ts";
import {
  hydratePostWithMediaPlatform,
  hydratePostsWithMediaPlatform,
  type SharedPreviewGenerationInput,
} from "./post-preview-hydration.ts";
import {
  buildPreviewAssetPublicUrl,
  createPopularPreviewAssetService,
  getPopularPreviewRetentionDays,
  type PreparedPopularPreview,
  type PreviewGenerationStrategy,
} from "./popular-preview-assets.ts";
import { fetchAllCreatorsFromSite, fetchPopularPostsFromSite, fetchPostDetailFromSite, type PopularResponse } from "./api/upstream.ts";
import { appendAppLog } from "./app-logger.ts";
import { getDataStore } from "./data-store.ts";
import {
  POPULAR_FULL_DETAIL_LIMIT,
  POPULAR_SNAPSHOT_TTL_MS,
  SERVER_POST_CACHE_TTL_MS,
  getRelevantSearchSites,
  isSnapshotFresh,
  type SearchCreatorsPageParams,
} from "./perf-cache.ts";
import {
  getPerformanceRepository,
  type CreatorSearchCacheMedia,
  type CreatorSnapshotInput,
  type MediaSourcePriorityClass,
  type PerformanceRepository,
  type PopularSnapshotInput,
  type PostCacheInput,
  type PostCacheRecord,
  type Site,
} from "./perf-repository.ts";

export interface HybridSearchResult {
  items: Array<UnifiedCreator>;
  total: number;
  page: number;
  perPage: number;
  services: string[];
  syncedAt: Date | null;
  source: "cache" | "db-cache" | "stale-cache";
}

export interface HybridCreatorPostsSearchResult {
  posts: UnifiedPost[];
  total: number;
  page: number;
  perPage: number;
  hasNextPage: boolean;
  scannedPages: number;
  truncated: boolean;
  source: "cache" | "upstream" | "stale-cache";
  cache: {
    hit: boolean;
    stale: boolean;
    ttlSeconds: number;
  };
}

export interface HybridPopularResult extends PopularResponse {
  source: "cache" | "live" | "live-refresh" | "stale-cache" | "empty";
}

export interface PopularWarmupPreviewSummary {
  totalPosts: number;
  generated: number;
  reused: number;
  skippedNoFfmpeg: number;
  failed: number;
  notVideo: number;
}

function createEmptyPopularWarmupPreviewSummary(): PopularWarmupPreviewSummary {
  return {
    totalPosts: 0,
    generated: 0,
    reused: 0,
    skippedNoFfmpeg: 0,
    failed: 0,
    notVideo: 0,
  };
}

function addPopularPreviewOutcomeToSummary(summary: PopularWarmupPreviewSummary, outcome: PreparedPopularPreview["previewOutcome"] | null | undefined) {
  summary.totalPosts += 1;
  switch (outcome) {
    case "generated":
      summary.generated += 1;
      break;
    case "reused":
      summary.reused += 1;
      break;
    case "skipped-no-ffmpeg":
      summary.skippedNoFfmpeg += 1;
      break;
    case "not-video":
      summary.notVideo += 1;
      break;
    case "failed":
    case "missing":
    default:
      summary.failed += 1;
      break;
  }
}

interface HybridDependencies {
  repository?: PerformanceRepository;
  getRepository?: () => Promise<PerformanceRepository>;
  syncCreatorsSnapshotForSite?: (site: Site, repository: PerformanceRepository) => Promise<number>;
  fetchPopularPostsLive?: (input: {
    site: Site;
    period: PopularSnapshotInput["period"];
    date: string | null;
    offset: number;
  }) => Promise<PopularResponse>;
  fetchCreatorPostsLive?: (site: Site, service: string, creatorId: string, offset?: number, cookie?: string, query?: string) => Promise<UnifiedPost[]>;
  fetchCreatorProfileLive?: (site: Site, service: string, creatorId: string) => Promise<UnifiedCreator | null>;
  fetchPostLive?: (input: {
    site: Site;
    service: string;
    creatorId: string;
    postId: string;
    cookie?: string;
  }) => Promise<UnifiedPost>;
  preparePopularPreviewAssets?: (input: { site: Site; post: UnifiedPost; now?: Date; generationStrategy?: PreviewGenerationStrategy; priorityClass?: MediaSourcePriorityClass }) => Promise<PreparedPopularPreview>;
  cleanupPopularPreviewAssets?: (input?: {
    now?: Date;
    retentionDays?: number;
    activeFingerprints?: Array<{ site: Site; sourceFingerprint: string }>;
  }) => Promise<{ deletedEntries: number }>;
  readCreatorProfileSnapshot?: (input: {
    site: Site;
    service: string;
    creatorId: string;
  }) => Promise<UnifiedCreator | null>;
  writeCreatorProfileSnapshot?: (input: {
    site: Site;
    service: string;
    creatorId: string;
    profile: UnifiedCreator;
  }) => Promise<void>;
  readFavoriteCreatorWarmTargets?: (sites: Site[]) => Promise<Array<{ site: Site; service: string; creatorId: string }>>;
  loadStoredSessionCookie?: (site: Site) => Promise<string | null>;
  readCreatorPostsSnapshot?: (input: {
    site: Site;
    service: string;
    creatorId: string;
    offset: number;
    query?: string;
  }) => Promise<UnifiedPost[]>;
  writeCreatorPostsSnapshot?: (input: {
    site: Site;
    service: string;
    creatorId: string;
    offset: number;
    query?: string;
    posts: UnifiedPost[];
  }) => Promise<void>;
}

export function createCreatorSnapshotRows(site: Site, creators: any[]): CreatorSnapshotInput[] {
  if (!Array.isArray(creators) || creators.length === 0) {
    throw new Error(`Creator snapshot refresh for ${site} returned no creators.`);
  }

  return creators.map((creator) => ({
    site,
    service: creator.service,
    creatorId: creator.id,
    name: creator.name,
    favorited: creator.favorited ?? null,
    updated: creator.updated ?? null,
    indexed: creator.indexed ?? null,
    publicId: creator.public_id ?? null,
    postCount: creator.post_count ?? null,
    profileImageUrl: proxyCdnUrl(site, `/icons/${creator.service}/${creator.id}`),
    bannerImageUrl: proxyCdnUrl(site, `/banners/${creator.service}/${creator.id}`),
    rawPreviewPayload: creator,
  }));
}

function toUnifiedCreators(items: Awaited<ReturnType<PerformanceRepository["searchCreatorsPage"]>>["items"]): UnifiedCreator[] {
  return items.map((item) => ({
    id: item.id,
    site: item.site,
    service: item.service,
    name: item.name,
    favorited: item.favorited,
    updated: item.updated ?? undefined,
    indexed: item.indexed ?? undefined,
    public_id: item.publicId,
    post_count: item.postCount ?? undefined,
  }));
}

function mapCachedCreatorToUnifiedCreator(record: Awaited<ReturnType<PerformanceRepository["getCreatorProfile"]>>): UnifiedCreator | null {
  if (!record) {
    return null;
  }

  const raw = record.rawPreviewPayload as UnifiedCreator | null;
  return raw
    ? {
        ...raw,
        site: record.site,
        service: record.service,
        id: record.id,
      }
    : {
        site: record.site,
        service: record.service,
        id: record.id,
        name: record.name,
        favorited: record.favorited,
        updated: record.updated ?? undefined,
        indexed: record.indexed ?? undefined,
        public_id: record.publicId,
        post_count: record.postCount ?? undefined,
      };
}

function applyPreparedPreviewToUnifiedPost(post: UnifiedPost, preview: PreparedPopularPreview): UnifiedPost {
  return {
    ...post,
    longestVideoUrl: preview.longestVideoUrl,
    longestVideoDurationSeconds: preview.longestVideoDurationSeconds,
    previewThumbnailUrl: buildPreviewAssetPublicUrl(preview.previewThumbnailAssetPath),
    previewClipUrl: buildPreviewAssetPublicUrl(preview.previewClipAssetPath),
    previewStatus: preview.previewStatus,
    previewGeneratedAt: preview.previewGeneratedAt?.toISOString() ?? null,
    previewError: preview.previewError,
    previewSourceFingerprint: preview.previewSourceFingerprint,
  };
}

function getPreviewGenerationStrategyForPost(post: UnifiedPost): PreviewGenerationStrategy {
  return post.site === "coomer" ? "thumbnail-first" : "full";
}

function shouldPersistPreparedPreview(preview: PreparedPopularPreview): boolean {
  return preview.previewOutcome === "generated" || preview.previewOutcome === "reused";
}

function mapCachedPostToUnifiedPost(record: Awaited<ReturnType<PerformanceRepository["getPostCache"]>> extends infer T ? T : never): UnifiedPost | null {
  if (!record) {
    return null;
  }

  const raw = (record.rawDetailPayload ?? record.rawPreviewPayload) as UnifiedPost | null;
  const basePost: UnifiedPost = raw
    ? {
        ...raw,
        site: record.site,
      }
    : {
        site: record.site,
        service: record.service,
        user: record.creatorId,
        id: record.postId,
        title: record.title ?? "",
        content: record.excerpt ?? "",
        published: record.publishedAt?.toISOString() ?? "",
        added: record.addedAt?.toISOString() ?? "",
        edited: record.editedAt?.toISOString() ?? "",
        embed: {},
        file: record.previewImageUrl
          ? {
              name: record.previewImageUrl.split("/").pop() ?? "preview",
              path: record.previewImageUrl,
            }
          : { name: "", path: "" },
        attachments: [],
      };

  return {
    ...basePost,
    site: record.site,
    longestVideoUrl: record.longestVideoUrl,
    longestVideoDurationSeconds: record.longestVideoDurationSeconds,
    previewThumbnailUrl: buildPreviewAssetPublicUrl(record.previewThumbnailAssetPath),
    previewClipUrl: buildPreviewAssetPublicUrl(record.previewClipAssetPath),
    previewStatus: record.previewStatus,
    previewGeneratedAt: record.previewGeneratedAt?.toISOString() ?? null,
    previewError: record.previewError,
    previewSourceFingerprint: record.previewSourceFingerprint,
  };
}

function createPostCacheInputFromUnifiedPost(
  post: UnifiedPost,
  sourceKind: string,
  detailLevel: "metadata" | "full",
  ttlMs = SERVER_POST_CACHE_TTL_MS,
  preview: PreparedPopularPreview | null = null
): PostCacheInput {
  const media = resolvePostMedia(post);
  return {
    site: post.site,
    service: post.service,
    creatorId: post.user,
    postId: post.id,
    title: post.title,
    excerpt: post.content ? String(post.content).slice(0, 500) : null,
    publishedAt: post.published,
    addedAt: post.added,
    editedAt: post.edited,
    previewImageUrl: media.previewImageUrl ?? null,
    videoUrl: media.videoUrl ?? null,
    mediaType: media.type,
    rawPreviewPayload: detailLevel === "full" ? post : { ...post, content: post.content ? String(post.content).slice(0, 500) : post.content },
    rawDetailPayload: detailLevel === "full" ? post : null,
    detailLevel,
    sourceKind,
    longestVideoUrl: preview?.longestVideoUrl ?? post.longestVideoUrl ?? null,
    longestVideoDurationSeconds: preview?.longestVideoDurationSeconds ?? post.longestVideoDurationSeconds ?? null,
    previewThumbnailAssetPath:
      preview?.previewThumbnailAssetPath
      ?? (post.previewThumbnailUrl ? post.previewThumbnailUrl.replace(/^\/api\/preview-assets\//, "") : null),
    previewClipAssetPath:
      preview?.previewClipAssetPath
      ?? (post.previewClipUrl ? post.previewClipUrl.replace(/^\/api\/preview-assets\//, "") : null),
    previewStatus: preview?.previewStatus ?? post.previewStatus ?? null,
    previewGeneratedAt: preview?.previewGeneratedAt ?? (post.previewGeneratedAt ? new Date(post.previewGeneratedAt) : null),
    previewError: preview?.previewError ?? post.previewError ?? null,
    previewSourceFingerprint: preview?.previewSourceFingerprint ?? post.previewSourceFingerprint ?? null,
    cachedAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

function formatSnapshotDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const CREATOR_FILTERED_SEARCH_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CREATOR_FILTERED_SEARCH_SCAN_LIMIT = 10;
const CREATOR_POSTS_UPSTREAM_PAGE_SIZE = 50;

function normalizeCreatorFilteredSearchQuery(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeCreatorFilteredSearchMedia(value?: string): CreatorSearchCacheMedia {
  return value === "images" || value === "videos" ? value : "all";
}

function matchesCreatorFilteredSearch(post: UnifiedPost, input: { normalizedQuery: string; media: CreatorSearchCacheMedia }): boolean {
  if (input.media === "images" && getPostType(post) !== "image") {
    return false;
  }
  if (input.media === "videos" && getPostType(post) !== "video") {
    return false;
  }
  if (!input.normalizedQuery) {
    return true;
  }
  return [post.title, post.content]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(input.normalizedQuery));
}

function createCreatorFilteredSearchResultFromPayload(
  payload: { posts?: unknown[]; total?: number; page?: number; perPage?: number; hasNextPage?: boolean; scannedPages?: number; truncated?: boolean },
  input: { source: "cache" | "upstream" | "stale-cache"; cacheHit: boolean; stale: boolean }
): HybridCreatorPostsSearchResult {
  return {
    posts: Array.isArray(payload.posts) ? payload.posts as UnifiedPost[] : [],
    total: Number(payload.total ?? 0),
    page: Number(payload.page ?? 1),
    perPage: Number(payload.perPage ?? CREATOR_POSTS_UPSTREAM_PAGE_SIZE),
    hasNextPage: Boolean(payload.hasNextPage),
    scannedPages: Number(payload.scannedPages ?? 0),
    truncated: Boolean(payload.truncated),
    source: input.source,
    cache: {
      hit: input.cacheHit,
      stale: input.stale,
      ttlSeconds: Math.floor(CREATOR_FILTERED_SEARCH_CACHE_TTL_MS / 1000),
    },
  };
}

function getRetentionBoundaryDate(now: Date, retentionDays: number): string {
  return formatSnapshotDate(new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000));
}

async function defaultSyncCreatorsSnapshotForSite(site: Site, repository: PerformanceRepository): Promise<number> {
  const creators = await fetchAllCreatorsFromSite(site);
  await repository.replaceCreatorSnapshot({
    site,
    syncedAt: new Date(),
    creators: createCreatorSnapshotRows(site, creators),
  });
  return creators.length;
}

async function defaultFetchPostLive(input: {
  site: Site;
  service: string;
  creatorId: string;
  postId: string;
  cookie?: string;
}): Promise<UnifiedPost> {
  const post = await fetchPostDetailFromSite(input);
  return {
    ...post,
    site: input.site,
  };
}

async function defaultReadCreatorProfileSnapshot(input: {
  site: Site;
  service: string;
  creatorId: string;
}): Promise<UnifiedCreator | null> {
  const store = await getDataStore();
  const snapshot = await store.getCreatorSnapshot({
    kind: "profile",
    site: input.site,
    service: input.service,
    creatorId: input.creatorId,
  });
  if (!snapshot?.data) {
    return null;
  }

  try {
    return JSON.parse(snapshot.data) as UnifiedCreator;
  } catch {
    return null;
  }
}

async function defaultWriteCreatorProfileSnapshot(input: {
  site: Site;
  service: string;
  creatorId: string;
  profile: UnifiedCreator;
}): Promise<void> {
  const store = await getDataStore();
  await store.setCreatorSnapshot({
    kind: "profile",
    site: input.site,
    service: input.service,
    creatorId: input.creatorId,
    data: input.profile,
  });
}

async function defaultReadCreatorPostsSnapshot(input: {
  site: Site;
  service: string;
  creatorId: string;
  offset: number;
  query?: string;
}): Promise<UnifiedPost[]> {
  const store = await getDataStore();
  const snapshot = await store.getCreatorSnapshot({
    kind: "posts",
    site: input.site,
    service: input.service,
    creatorId: input.creatorId,
    offset: input.offset,
    query: input.query,
  });
  if (!snapshot?.data) {
    return [];
  }

  try {
    const parsed = JSON.parse(snapshot.data);
    return Array.isArray(parsed) ? parsed as UnifiedPost[] : [];
  } catch {
    return [];
  }
}

async function defaultWriteCreatorPostsSnapshot(input: {
  site: Site;
  service: string;
  creatorId: string;
  offset: number;
  query?: string;
  posts: UnifiedPost[];
}): Promise<void> {
  const store = await getDataStore();
  await store.setCreatorSnapshot({
    kind: "posts",
    site: input.site,
    service: input.service,
    creatorId: input.creatorId,
    offset: input.offset,
    query: input.query,
    data: input.posts,
  });
}

async function defaultReadFavoriteCreatorWarmTargets(sites: Site[]): Promise<Array<{ site: Site; service: string; creatorId: string }>> {
  const store = await getDataStore();
  const targets = [] as Array<{ site: Site; service: string; creatorId: string }>;
  const seen = new Set<string>();

  for (const site of sites) {
    const snapshot = await store.getFavoriteSnapshot({ kind: "creator", site });
    if (!snapshot?.data) {
      continue;
    }

    try {
      const creators = JSON.parse(snapshot.data);
      if (!Array.isArray(creators)) {
        continue;
      }
      for (const creator of creators) {
        if (!creator || typeof creator !== "object") {
          continue;
        }
        const service = String(creator.service ?? "").trim();
        const creatorId = String(creator.id ?? "").trim();
        if (!service || !creatorId) {
          continue;
        }
        const key = `${site}:${service}:${creatorId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        targets.push({ site, service, creatorId });
      }
    } catch {
      // Ignore malformed favorite snapshots.
    }
  }

  return targets;
}

async function defaultLoadStoredSessionCookie(site: Site): Promise<string | null> {
  const store = await getDataStore();
  const session = await store.getLatestKimonoSession(site);
  return session?.cookie ?? null;
}

export function createHybridContentService(dependencies: HybridDependencies = {}) {
  const resolveRepository = dependencies.repository
    ? async () => dependencies.repository as PerformanceRepository
    : (dependencies.getRepository ?? getPerformanceRepository);
  let repositoryPromise: Promise<PerformanceRepository> | null = null;
  const getRepository = () => {
    repositoryPromise ??= resolveRepository();
    return repositoryPromise;
  };
  const syncCreatorsSnapshotForSite = dependencies.syncCreatorsSnapshotForSite ?? defaultSyncCreatorsSnapshotForSite;
  const fetchPopularPostsLive = dependencies.fetchPopularPostsLive ?? (async ({ site, period, date, offset }) => {
    const response = await fetchPopularPostsFromSite({ site, period, date, offset });
    return {
      ...response,
      posts: response.posts.map((post) => ({ ...post, site })),
    } as PopularResponse;
  });
  const fetchCreatorPostsLive = dependencies.fetchCreatorPostsLive ?? (async (...args) => { const module = await import("./api/unified.ts"); return module.fetchCreatorPostsBySite(...args); });
  const fetchCreatorProfileLive = dependencies.fetchCreatorProfileLive ?? (async (...args) => { const module = await import("./api/unified.ts"); return module.fetchCreatorProfileBySite(...args); });
  const fetchPostLive = dependencies.fetchPostLive ?? defaultFetchPostLive;
  let previewAssetServicePromise: Promise<ReturnType<typeof createPopularPreviewAssetService>> | null = null;
  const getPreviewAssetService = () => {
    previewAssetServicePromise ??= (async () =>
      createPopularPreviewAssetService({
        repository: await getRepository(),
      }))();
    return previewAssetServicePromise;
  };
  const preparePopularPreviewAssets = dependencies.preparePopularPreviewAssets ?? (async (input) => {
    const previewAssetService = await getPreviewAssetService();
    return previewAssetService.preparePreviewForPost(input);
  });
  const cleanupPopularPreviewAssets = dependencies.cleanupPopularPreviewAssets ?? (async (input) => {
    const previewAssetService = await getPreviewAssetService();
    return previewAssetService.cleanupPreviewAssets(input);
  });
  const readCreatorProfileSnapshot = dependencies.readCreatorProfileSnapshot ?? defaultReadCreatorProfileSnapshot;
  const writeCreatorProfileSnapshot = dependencies.writeCreatorProfileSnapshot ?? defaultWriteCreatorProfileSnapshot;
  const readCreatorPostsSnapshot = dependencies.readCreatorPostsSnapshot ?? defaultReadCreatorPostsSnapshot;
  const writeCreatorPostsSnapshot = dependencies.writeCreatorPostsSnapshot ?? defaultWriteCreatorPostsSnapshot;
  const readFavoriteCreatorWarmTargets = dependencies.readFavoriteCreatorWarmTargets ?? defaultReadFavoriteCreatorWarmTargets;
  const loadStoredSessionCookie = dependencies.loadStoredSessionCookie ?? defaultLoadStoredSessionCookie;

  const createPopularMediaScheduler = (repository: PerformanceRepository) =>
    async (input: SharedPreviewGenerationInput) => {
      if (input.mediaKind !== "video") {
        return;
      }

      void (async () => {
        try {
          const preparedPreview = await preparePopularPreviewAssets({
            site: input.site,
            post: input.post,
            generationStrategy: getPreviewGenerationStrategyForPost(input.post),
            priorityClass: input.priorityClass ?? "popular",
          });
          if (!shouldPersistPreparedPreview(preparedPreview)) {
            return;
          }

          const enrichedPost = applyPreparedPreviewToUnifiedPost(input.post, preparedPreview);
          await repository.upsertPostCache(
            createPostCacheInputFromUnifiedPost(
              enrichedPost,
              "popular",
              "metadata",
              POPULAR_SNAPSHOT_TTL_MS,
              preparedPreview
            )
          );
        } catch {
          // Popular keeps the stronger scheduler best-effort and non-blocking.
        }
      })();
    };

  return {
    async searchCreatorsPage(input: SearchCreatorsPageParams): Promise<HybridSearchResult> {
      const repository = await getRepository();
      const initial = await repository.searchCreatorsPage(input);
      const initialResult = {
        ...initial,
        items: toUnifiedCreators(initial.items),
      };

      if (initial.snapshotFresh) {
        return {
          ...initialResult,
          source: "cache",
        };
      }

      if (initial.items.length > 0 || initial.total > 0 || initial.syncedAt) {
        return {
          ...initialResult,
          source: "db-cache",
        };
      }

      return {
        ...initialResult,
        source: "stale-cache",
      };
    },

    async getPopularPosts(input: {
      site: Site;
      period: PopularSnapshotInput["period"];
      date: string | null;
      offset: number;
    }): Promise<HybridPopularResult> {
      const repository = await getRepository();
      const cached = await repository.getPopularSnapshot({
        site: input.site,
        period: input.period,
        rangeDate: input.date,
        pageOffset: input.offset,
      });

      if (cached.posts.length > 0 && cached.snapshotFresh) {
        const cachedPosts = cached.posts
          .map((post) => mapCachedPostToUnifiedPost(post))
          .filter((post): post is UnifiedPost => Boolean(post));
        const hydratedCachedPosts = await hydratePostsWithMediaPlatform(cachedPosts, {
          repository,
          context: "popular",
          schedulePreviewGeneration: createPopularMediaScheduler(repository),
        });
        return {
          info: null,
          props: { count: cached.posts.length },
          posts: hydratedCachedPosts,
          source: "cache",
        };
      }

      try {
        const live = await fetchPopularPostsLive(input);

        // P0: Hydrate with any existing preview assets from DB, return immediately
        const hydratedPosts = await hydratePostsWithMediaPlatform(
          live.posts.map((post) => ({ ...post, site: input.site }) as UnifiedPost),
          {
            repository,
            context: "popular",
            schedulePreviewGeneration: createPopularMediaScheduler(repository),
          }
        );

        // Persist hydrated posts and snapshot synchronously (fast DB writes)
        for (const [index, post] of hydratedPosts.entries()) {
          await repository.upsertPostCache(
            createPostCacheInputFromUnifiedPost(
              post,
              "popular",
              index < POPULAR_FULL_DETAIL_LIMIT ? "full" : "metadata",
              POPULAR_SNAPSHOT_TTL_MS
            )
          );
        }
        await repository.replacePopularSnapshot({
          site: input.site,
          period: input.period,
          rangeDate: input.date,
          pageOffset: input.offset,
          snapshotDate: formatSnapshotDate(new Date()),
          posts: hydratedPosts.map((post, index) => ({
            rank: index + 1,
            site: input.site,
            service: post.service,
            creatorId: post.user,
            postId: post.id,
          })),
        });

        return {
          ...live,
          posts: hydratedPosts,
          source: cached.posts.length > 0 ? "live-refresh" : "live",
        };
      } catch {
        if (cached.posts.length > 0) {
          const cachedPosts = cached.posts
            .map((post) => mapCachedPostToUnifiedPost(post))
            .filter((post): post is UnifiedPost => Boolean(post));
          const hydratedCachedPosts = await hydratePostsWithMediaPlatform(cachedPosts, {
            repository,
            context: "popular",
            schedulePreviewGeneration: createPopularMediaScheduler(repository),
          });
          return {
            info: null,
            props: { count: cached.posts.length },
            posts: hydratedCachedPosts,
            source: "stale-cache",
          };
        }

        return {
          info: null,
          props: null,
          posts: [],
          source: "empty",
        };
      }
    },

    async runCreatorSnapshotJob(input?: {
      sites?: Site[];
      favoritesOnly?: boolean;
      postOffsets?: number[];
    }) {
      const repository = await getRepository();
      const sites = input?.sites?.length ? input.sites : (["kemono", "coomer"] as Site[]);

      if (!input?.favoritesOnly) {
        const results = await Promise.allSettled(
          sites.map(async (site) => ({
            site,
            count: await syncCreatorsSnapshotForSite(site, repository),
          }))
        );

        return {
          ok: results.every((result) => result.status === "fulfilled"),
          mode: "full-snapshot" as const,
          sites: results.map((result, index) =>
            result.status === "fulfilled"
              ? result.value
              : {
                  site: sites[index],
                  count: 0,
                  error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                }
          ),
        };
      }

      const targets = await readFavoriteCreatorWarmTargets(sites);
      const postOffsets = Array.from(new Set((input?.postOffsets?.filter((offset) => Number.isFinite(offset) && offset >= 0) ?? [0, 50]).map((offset) => Number(offset))));

      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const previewSummary = createEmptyPopularWarmupPreviewSummary();
          const errors: string[] = [];
          let profileWarmed = false;
          let warmedPostPages = 0;
          let totalPosts = 0;
          const warmedOffsets: number[] = [];
          const cookie = await loadStoredSessionCookie(target.site);

          try {
            const liveProfile = await fetchCreatorProfileLive(target.site, target.service, target.creatorId);
            if (liveProfile) {
              await repository.upsertCreatorProfile({
                site: target.site,
                service: target.service,
                creatorId: target.creatorId,
                name: liveProfile.name,
                favorited: liveProfile.favorited ?? null,
                updated: liveProfile.updated,
                indexed: liveProfile.indexed,
                publicId: liveProfile.public_id ?? null,
                postCount: liveProfile.post_count ?? null,
                profileImageUrl: proxyCdnUrl(target.site, `/icons/${target.service}/${target.creatorId}`),
                bannerImageUrl: proxyCdnUrl(target.site, `/banners/${target.service}/${target.creatorId}`),
                rawPreviewPayload: liveProfile,
                syncedAt: new Date(),
              });
              await writeCreatorProfileSnapshot({
                site: target.site,
                service: target.service,
                creatorId: target.creatorId,
                profile: liveProfile,
              });
              profileWarmed = true;
            }
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }

          for (const offset of postOffsets) {
            try {
              const livePosts = await fetchCreatorPostsLive(target.site, target.service, target.creatorId, offset, cookie ?? undefined);
              const hydratedPosts = await hydratePostsWithMediaPlatform(livePosts, {
                repository,
                context: "creator-page",
              });
              const enrichedPosts = await Promise.all(
                hydratedPosts.map(async (post) => {
                  const preparedPreview = await preparePopularPreviewAssets({
                    site: target.site,
                    post,
                    generationStrategy: "thumbnail-first",
                  });
                  addPopularPreviewOutcomeToSummary(previewSummary, preparedPreview.previewOutcome);
                  return applyPreparedPreviewToUnifiedPost(post, preparedPreview);
                })
              );

              await Promise.all(
                enrichedPosts.map((post) =>
                  repository.upsertPostCache(
                    createPostCacheInputFromUnifiedPost(post, "creator-page", "metadata")
                  )
                )
              );
              await writeCreatorPostsSnapshot({
                site: target.site,
                service: target.service,
                creatorId: target.creatorId,
                offset,
                posts: enrichedPosts,
              });
              warmedOffsets.push(offset);
              warmedPostPages += 1;
              totalPosts += enrichedPosts.length;
            } catch (error) {
              errors.push(error instanceof Error ? error.message : String(error));
            }
          }

          return {
            ...target,
            profileWarmed,
            warmedOffsets,
            warmedPostPages,
            totalPosts,
            previewSummary,
            errors,
          };
        })
      );

      const creators = results.map((result, index) =>
        result.status === "fulfilled"
          ? result.value
          : {
              ...targets[index],
              profileWarmed: false,
              warmedOffsets: [],
              warmedPostPages: 0,
              totalPosts: 0,
              previewSummary: createEmptyPopularWarmupPreviewSummary(),
              errors: [result.reason instanceof Error ? result.reason.message : String(result.reason)],
            }
      );

      const summary = creators.reduce((aggregate, creator) => {
        aggregate.totalCreators += 1;
        aggregate.warmedProfiles += creator.profileWarmed ? 1 : 0;
        aggregate.warmedPostPages += creator.warmedPostPages;
        aggregate.totalPosts += creator.totalPosts;
        aggregate.generated += creator.previewSummary.generated;
        aggregate.reused += creator.previewSummary.reused;
        aggregate.skippedNoFfmpeg += creator.previewSummary.skippedNoFfmpeg;
        aggregate.failed += creator.previewSummary.failed;
        aggregate.notVideo += creator.previewSummary.notVideo;
        aggregate.failedCreators += creator.errors.length > 0 ? 1 : 0;
        return aggregate;
      }, {
        totalCreators: 0,
        warmedProfiles: 0,
        warmedPostPages: 0,
        totalPosts: 0,
        generated: 0,
        reused: 0,
        skippedNoFfmpeg: 0,
        failed: 0,
        notVideo: 0,
        failedCreators: 0,
      });

      return {
        ok: creators.every((creator) => creator.errors.length === 0),
        mode: "favorites-warmup" as const,
        summary,
        creators,
      };
    },

    async runPopularWarmupJob(input?: {
      sites?: Site[];
      periods?: PopularSnapshotInput["period"][];
      recentOffsets?: number[];
    }) {
      const repository = await getRepository();
      const sites = input?.sites?.length ? input.sites : (["kemono", "coomer"] as Site[]);
      const periods = input?.periods?.length ? input.periods : (["recent", "day", "week"] as PopularSnapshotInput["period"][]);
      const recentOffsets = input?.recentOffsets?.length ? input.recentOffsets : [0];
      const tasks: Array<{ site: Site; period: PopularSnapshotInput["period"]; offset: number; date: string | null }> = [];

      for (const site of sites) {
        for (const period of periods) {
          if (period === "recent") {
            for (const offset of recentOffsets) {
              tasks.push({ site, period, offset, date: null });
            }
          } else {
            tasks.push({ site, period, offset: 0, date: null });
          }
        }
      }

      const results = await Promise.allSettled(
        tasks.map(async (task) => {
          const now = new Date();
          const live = await fetchPopularPostsLive(task);
          const previewSummary = createEmptyPopularWarmupPreviewSummary();
          const enrichedPosts = await Promise.all(
            live.posts.map(async (post) => {
              const preparedPreview = await preparePopularPreviewAssets({
                site: task.site,
                post: post as UnifiedPost,
                now,
                priorityClass: "popular",
              });
              addPopularPreviewOutcomeToSummary(previewSummary, preparedPreview.previewOutcome);

              return {
                post: applyPreparedPreviewToUnifiedPost(post as UnifiedPost, preparedPreview),
                preview: preparedPreview,
              };
            })
          );

          for (const [index, entry] of enrichedPosts.entries()) {
            await repository.upsertPostCache(
              createPostCacheInputFromUnifiedPost(
                entry.post,
                "popular",
                index < POPULAR_FULL_DETAIL_LIMIT ? "full" : "metadata",
                POPULAR_SNAPSHOT_TTL_MS,
                entry.preview
              )
            );
          }

          await repository.replacePopularSnapshot({
            site: task.site,
            period: task.period,
            rangeDate: task.date,
            pageOffset: task.offset,
            snapshotDate: formatSnapshotDate(now),
            posts: enrichedPosts.map(({ post }, index) => ({
              rank: index + 1,
              site: task.site,
              service: post.service,
              creatorId: post.user,
              postId: post.id,
            })),
          });

          return {
            ...task,
            count: live.posts.length,
            previewSummary,
          };
        })
      );

      const now = new Date();
      const retentionDays = getPopularPreviewRetentionDays();
      const snapshotDateFrom = getRetentionBoundaryDate(now, retentionDays);
      const activeFingerprints = await repository.listActivePreviewSourceFingerprints({ snapshotDateFrom });
      const cleanup = await cleanupPopularPreviewAssets({
        now,
        retentionDays,
        activeFingerprints,
      });
      await repository.deletePopularSnapshotsOlderThan({
        snapshotDateBefore: snapshotDateFrom,
      });

      const runs = results.map((result, index) =>
        result.status === "fulfilled"
          ? result.value
          : {
              ...tasks[index],
              count: 0,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
              previewSummary: createEmptyPopularWarmupPreviewSummary(),
            }
      );
      const summary = runs.reduce((aggregate, run) => {
        aggregate.totalPosts += run.previewSummary.totalPosts;
        aggregate.generated += run.previewSummary.generated;
        aggregate.reused += run.previewSummary.reused;
        aggregate.skippedNoFfmpeg += run.previewSummary.skippedNoFfmpeg;
        aggregate.failed += run.previewSummary.failed;
        aggregate.notVideo += run.previewSummary.notVideo;
        return aggregate;
      }, {
        totalTasks: tasks.length,
        succeededTasks: results.filter((result) => result.status === "fulfilled").length,
        failedTasks: results.filter((result) => result.status === "rejected").length,
        totalPosts: 0,
        generated: 0,
        reused: 0,
        skippedNoFfmpeg: 0,
        failed: 0,
        notVideo: 0,
      });

      await appendAppLog({
        source: "preview",
        level: summary.failedTasks > 0 || summary.failed > 0 ? "warn" : "info",
        message: "popular warmup complete",
        details: summary,
      });

      return {
        ok: results.every((result) => result.status === "fulfilled"),
        cleanup,
        summary,
        runs,
      };
    },

    async getCreatorProfile(input: {
      site: Site;
      service: string;
      creatorId: string;
    }) {
      const repository = await getRepository();
      const cached = await repository.getCreatorProfile(input);
      const cachedProfile = mapCachedCreatorToUnifiedCreator(cached);
      if (cached && isSnapshotFresh(cached.syncedAt, SERVER_POST_CACHE_TTL_MS) && cachedProfile) {
        return {
          profile: cachedProfile,
          source: "cache" as const,
        };
      }

      try {
        const live = await fetchCreatorProfileLive(input.site, input.service, input.creatorId);
        if (live) {
          await repository.upsertCreatorProfile({
            site: input.site,
            service: input.service,
            creatorId: input.creatorId,
            name: live.name,
            favorited: live.favorited ?? null,
            updated: live.updated,
            indexed: live.indexed,
            publicId: live.public_id ?? null,
            postCount: live.post_count ?? null,
            profileImageUrl: proxyCdnUrl(input.site, `/icons/${input.service}/${input.creatorId}`),
            bannerImageUrl: proxyCdnUrl(input.site, `/banners/${input.service}/${input.creatorId}`),
            rawPreviewPayload: live,
            syncedAt: new Date(),
          });
          void writeCreatorProfileSnapshot({
            site: input.site,
            service: input.service,
            creatorId: input.creatorId,
            profile: live,
          }).catch(() => undefined);
          return {
            profile: live,
            source: cached ? "live-refresh" as const : "live" as const,
          };
        }
      } catch {
        // Fall through to stale cached and persisted snapshots.
      }

      if (cachedProfile) {
        return {
          profile: cachedProfile,
          source: "stale-cache" as const,
        };
      }

      const snapshotProfile = await readCreatorProfileSnapshot(input);
      if (snapshotProfile) {
        return {
          profile: snapshotProfile,
          source: "stale-cache" as const,
        };
      }

      return {
        profile: null,
        source: "empty" as const,
      };
    },

    async searchCreatorPosts(input: {
      site: Site;
      service: string;
      creatorId: string;
      query?: string;
      media?: string;
      page: number;
      perPage: number;
      cookie?: string;
      now?: Date;
    }): Promise<HybridCreatorPostsSearchResult> {
      const repository = await getRepository();
      const now = input.now ?? new Date();
      const normalizedQuery = normalizeCreatorFilteredSearchQuery(input.query);
      const normalizedMedia = normalizeCreatorFilteredSearchMedia(input.media);
      const trimmedQuery = input.query?.trim() || undefined;
      const cached = await repository.getCreatorSearchCache({
        site: input.site,
        service: input.service,
        creatorId: input.creatorId,
        normalizedQuery,
        media: normalizedMedia,
        page: input.page,
        perPage: input.perPage,
      });

      if (cached && cached.expiresAt.getTime() >= now.getTime()) {
        return createCreatorFilteredSearchResultFromPayload(cached.payload, {
          source: "cache",
          cacheHit: true,
          stale: false,
        });
      }

      try {
        const collected: UnifiedPost[] = [];
        const seen = new Set<string>();
        let scannedPages = 0;
        let reachedEnd = false;
        let lastPageSize = 0;

        for (let offset = 0; scannedPages < CREATOR_FILTERED_SEARCH_SCAN_LIMIT; offset += CREATOR_POSTS_UPSTREAM_PAGE_SIZE) {
          const livePage = await fetchCreatorPostsLive(
            input.site,
            input.service,
            input.creatorId,
            offset,
            input.cookie,
            trimmedQuery,
          );
          lastPageSize = livePage.length;
          scannedPages += 1;

          const hydratedPage = await hydratePostsWithMediaPlatform(livePage, {
            repository,
            context: trimmedQuery ? "search-query" : "creator-search",
          });

          for (const post of hydratedPage) {
            const key = `${post.site}:${post.service}:${post.user}:${post.id}`;
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            if (matchesCreatorFilteredSearch(post, { normalizedQuery, media: normalizedMedia })) {
              collected.push(post);
            }
          }

          if (livePage.length < CREATOR_POSTS_UPSTREAM_PAGE_SIZE) {
            reachedEnd = true;
            break;
          }
        }

        const startIndex = Math.max(0, (input.page - 1) * input.perPage);
        const payload = {
          posts: collected.slice(startIndex, startIndex + input.perPage),
          total: collected.length,
          page: input.page,
          perPage: input.perPage,
          hasNextPage: startIndex + input.perPage < collected.length || (!reachedEnd && scannedPages === CREATOR_FILTERED_SEARCH_SCAN_LIMIT && lastPageSize === CREATOR_POSTS_UPSTREAM_PAGE_SIZE),
          scannedPages,
          truncated: !reachedEnd && scannedPages === CREATOR_FILTERED_SEARCH_SCAN_LIMIT && lastPageSize === CREATOR_POSTS_UPSTREAM_PAGE_SIZE,
          source: "upstream",
          cache: {
            hit: false,
            stale: false,
            ttlSeconds: Math.floor(CREATOR_FILTERED_SEARCH_CACHE_TTL_MS / 1000),
          },
        };

        await repository.upsertCreatorSearchCache({
          site: input.site,
          service: input.service,
          creatorId: input.creatorId,
          normalizedQuery,
          media: normalizedMedia,
          page: input.page,
          perPage: input.perPage,
          payload,
          cachedAt: now,
          expiresAt: new Date(now.getTime() + CREATOR_FILTERED_SEARCH_CACHE_TTL_MS),
        });

        return createCreatorFilteredSearchResultFromPayload(payload, {
          source: "upstream",
          cacheHit: false,
          stale: false,
        });
      } catch {
        if (cached) {
          return createCreatorFilteredSearchResultFromPayload(cached.payload, {
            source: "stale-cache",
            cacheHit: false,
            stale: true,
          });
        }

        throw new Error("creator filtered search unavailable");
      }
    },

    async getCreatorPostsSnapshotScope(input: {
      site: Site;
      service: string;
      creatorId: string;
      query?: string;
      media?: "tout" | "images" | "videos";
    }) {
      const repository = await getRepository();
      const collected: UnifiedPost[] = [];
      const seen = new Set<string>();

      for (let offset = 0; offset <= 500; offset += 50) {
        const snapshotPosts = await readCreatorPostsSnapshot({
          site: input.site,
          service: input.service,
          creatorId: input.creatorId,
          offset,
        });

        if (snapshotPosts.length === 0) {
          if (offset > 0) {
            break;
          }
          continue;
        }

        for (const post of snapshotPosts) {
          const key = `${post.site}:${post.service}:${post.user}:${post.id}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          collected.push(post);
        }

        if (snapshotPosts.length < 50) {
          break;
        }
      }

      const hydratedPosts = await hydratePostsWithMediaPlatform(collected, {
        repository,
        context: "creator-page",
      });
      const normalizedQuery = input.query?.trim().toLowerCase() ?? "";
      const filteredPosts = hydratedPosts.filter((post) => {
        if (input.media === "images" && getPostType(post) !== "image") return false;
        if (input.media === "videos" && getPostType(post) !== "video") return false;
        if (!normalizedQuery) return true;

        return [post.title, post.content]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      });

      const cachedProfile = mapCachedCreatorToUnifiedCreator(await repository.getCreatorProfile(input));
      const snapshotProfile = cachedProfile ?? await readCreatorProfileSnapshot(input);
      const knownTotal = typeof snapshotProfile?.post_count === "number" ? snapshotProfile.post_count : null;

      return {
        posts: filteredPosts,
        source: collected.length > 0 ? "snapshot" as const : "empty" as const,
        scope: "snapshot" as const,
        partial: knownTotal === null ? collected.length === 0 : collected.length < knownTotal,
      };
    },

    async getCreatorPosts(input: {
      site: Site;
      service: string;
      creatorId: string;
      offset: number;
      cookie?: string;
      query?: string;
    }) {
      const repository = await getRepository();
      const query = input.query?.trim();
      let staleCachedRows = [] as PostCacheRecord[];
      if (!query) {
        const freshCachedRows = await repository.listCreatorPosts({
          site: input.site,
          service: input.service,
          creatorId: input.creatorId,
          offset: input.offset,
          limit: 50,
          freshOnly: true,
        });
        if (freshCachedRows.length >= 50) {
          const cachedPosts = await hydratePostsWithMediaPlatform(
            freshCachedRows
              .map((post) => mapCachedPostToUnifiedPost(post))
              .filter((post): post is UnifiedPost => Boolean(post)),
            {
              repository,
              context: query ? "search-query" : "creator-page",
            }
          );
          return {
            posts: cachedPosts,
            source: "cache" as const,
          };
        }

        staleCachedRows = freshCachedRows.length > 0
          ? freshCachedRows
          : await repository.listCreatorPosts({
              site: input.site,
              service: input.service,
              creatorId: input.creatorId,
              offset: input.offset,
              limit: 50,
              freshOnly: false,
            });
      }

      try {
        const live = await fetchCreatorPostsLive(input.site, input.service, input.creatorId, input.offset, input.cookie, query);
        const hydratedLive = await hydratePostsWithMediaPlatform(live, {
          repository,
          context: query ? "search-query" : "creator-page",
        });
        await Promise.all(
          hydratedLive.map((post) =>
            repository.upsertPostCache(
              createPostCacheInputFromUnifiedPost(post as UnifiedPost, query ? "search-query" : "creator-page", "metadata")
            )
          )
        );
        if (!query) {
          void writeCreatorPostsSnapshot({
            site: input.site,
            service: input.service,
            creatorId: input.creatorId,
            offset: input.offset,
            posts: hydratedLive,
          }).catch(() => undefined);
        }

        return {
          posts: hydratedLive,
          source: "live" as const,
        };
      } catch {
        if (!query && staleCachedRows.length > 0) {
          const stalePosts = await hydratePostsWithMediaPlatform(
            staleCachedRows
              .map((post) => mapCachedPostToUnifiedPost(post))
              .filter((post): post is UnifiedPost => Boolean(post)),
            {
              repository,
              context: "creator-page",
            }
          );
          return {
            posts: stalePosts,
            source: "stale-cache" as const,
          };
        }

        if (!query) {
          const snapshotPosts = await readCreatorPostsSnapshot({
            site: input.site,
            service: input.service,
            creatorId: input.creatorId,
            offset: input.offset,
          });
          if (snapshotPosts.length > 0) {
            const hydratedSnapshotPosts = await hydratePostsWithMediaPlatform(snapshotPosts, {
              repository,
              context: "creator-page",
            });
            return {
              posts: hydratedSnapshotPosts,
              source: "stale-cache" as const,
            };
          }
        }

        throw new Error("creator posts unavailable");
      }
    },

    async getPostDetail(input: {
      site: Site;
      service: string;
      creatorId: string;
      postId: string;
      cookie?: string;
    }) {
      const repository = await getRepository();
      const cached = await repository.getPostCache(input);
      if (cached && cached.detailLevel === "full" && cached.expiresAt.getTime() > Date.now()) {
        const post = mapCachedPostToUnifiedPost(cached);
        if (post) {
          const hydratedCachedPost = await hydratePostWithMediaPlatform(post, {
            repository,
            context: "post-detail",
          });
          return {
            post: hydratedCachedPost,
            source: "cache" as const,
          };
        }
      }

      try {
        const live = await fetchPostLive(input);
        const hydratedLive = await hydratePostWithMediaPlatform(live, {
          repository,
          context: "post-detail",
        });
        await repository.upsertPostCache(createPostCacheInputFromUnifiedPost(hydratedLive as UnifiedPost, "post-detail", "full"));

        return {
          post: hydratedLive,
          source: cached ? "live-refresh" as const : "live" as const,
        };
      } catch {
        if (cached) {
          const post = mapCachedPostToUnifiedPost(cached);
          if (post) {
            const hydratedCachedPost = await hydratePostWithMediaPlatform(post, {
              repository,
              context: "post-detail",
            });
            return {
              post: hydratedCachedPost,
              source: "stale-cache" as const,
            };
          }
        }

        for (let offset = 0; offset <= 500; offset += 50) {
          const snapshotPosts = await readCreatorPostsSnapshot({
            site: input.site,
            service: input.service,
            creatorId: input.creatorId,
            offset,
          });

          if (snapshotPosts.length === 0) {
            if (offset > 0) {
              break;
            }
            continue;
          }

          const snapshotPost = snapshotPosts.find((post) => post.id === input.postId);
          if (snapshotPost) {
            const hydratedSnapshotPost = await hydratePostWithMediaPlatform(snapshotPost, {
              repository,
              context: "post-detail",
            });
            return {
              post: hydratedSnapshotPost,
              source: "stale-cache" as const,
            };
          }

          if (snapshotPosts.length < 50) {
            break;
          }
        }

        throw new Error("post detail unavailable");
      }
    },
  };
}













