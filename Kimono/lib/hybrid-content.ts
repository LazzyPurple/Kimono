import { proxyCdnUrl, resolvePostMedia, type UnifiedCreator, type UnifiedPost } from "./api/helpers.ts";
import { hydratePostWithCachedPreviewAssets, hydratePostsWithCachedPreviewAssets } from "./post-preview-hydration.ts";
import {
  buildPreviewAssetPublicUrl,
  createPopularPreviewAssetService,
  getPopularPreviewRetentionDays,
  type PreparedPopularPreview,
} from "./popular-preview-assets.ts";
import { fetchAllCreatorsFromSite, fetchPopularPostsFromSite, fetchPostDetailFromSite, type PopularResponse } from "./api/upstream.ts";
import { appendAppLog } from "./app-logger.ts";
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
  type CreatorSnapshotInput,
  type PerformanceRepository,
  type PopularSnapshotInput,
  type PostCacheInput,
  type Site,
} from "./perf-repository.ts";

export interface HybridSearchResult {
  items: Array<UnifiedCreator>;
  total: number;
  page: number;
  perPage: number;
  services: string[];
  syncedAt: Date | null;
  source: "cache" | "live-refresh" | "stale-cache";
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
  preparePopularPreviewAssets?: (input: { site: Site; post: UnifiedPost; now?: Date }) => Promise<PreparedPopularPreview>;
  cleanupPopularPreviewAssets?: (input?: {
    now?: Date;
    retentionDays?: number;
    activeFingerprints?: Array<{ site: Site; sourceFingerprint: string }>;
  }) => Promise<{ deletedEntries: number }>;
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
    favorited: Number(creator.favorited ?? 0),
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

      const sites = getRelevantSearchSites(input.filter, input.likedCreatorKeys ?? []);
      if (sites.length === 0) {
        return {
          ...initialResult,
          source: "stale-cache",
        };
      }

      try {
        await Promise.all(sites.map((site) => syncCreatorsSnapshotForSite(site, repository)));
      } catch {
        return {
          ...initialResult,
          source: "stale-cache",
        };
      }

      const refreshed = await repository.searchCreatorsPage(input);
      const refreshedResult = {
        ...refreshed,
        items: toUnifiedCreators(refreshed.items),
      };

      if (refreshed.snapshotFresh) {
        return {
          ...refreshedResult,
          source: "live-refresh",
        };
      }

      return {
        ...((refreshed.items.length > 0 || initial.items.length === 0) ? refreshedResult : initialResult),
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
        return {
          info: null,
          props: { count: cached.posts.length },
          posts: cached.posts.map((post) => mapCachedPostToUnifiedPost(post)).filter((post): post is UnifiedPost => Boolean(post)),
          source: "cache",
        };
      }

      try {
        const live = await fetchPopularPostsLive(input);
        const enrichedPosts = await Promise.all(
          live.posts.map(async (post) => {
            const preparedPreview = await preparePopularPreviewAssets({
              site: input.site,
              post: post as UnifiedPost,
            });

            return applyPreparedPreviewToUnifiedPost(post as UnifiedPost, preparedPreview);
          })
        );

        for (const [index, post] of enrichedPosts.entries()) {
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
          posts: enrichedPosts.map((post, index) => ({
            rank: index + 1,
            site: input.site,
            service: post.service,
            creatorId: post.user,
            postId: post.id,
          })),
        });

        return {
          ...live,
          posts: enrichedPosts,
          source: cached.posts.length > 0 ? "live-refresh" : "live",
        };
      } catch {
        if (cached.posts.length > 0) {
          return {
            info: null,
            props: { count: cached.posts.length },
            posts: cached.posts.map((post) => mapCachedPostToUnifiedPost(post)).filter((post): post is UnifiedPost => Boolean(post)),
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
    }) {
      const repository = await getRepository();
      const sites = input?.sites?.length ? input.sites : (["kemono", "coomer"] as Site[]);
      const results = await Promise.allSettled(
        sites.map(async (site) => ({
          site,
          count: await syncCreatorsSnapshotForSite(site, repository),
        }))
      );

      return {
        ok: results.every((result) => result.status === "fulfilled"),
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
      if (cached && isSnapshotFresh(cached.syncedAt, SERVER_POST_CACHE_TTL_MS)) {
        return {
          profile: (cached.rawPreviewPayload ?? {
            id: cached.id,
            service: cached.service,
            name: cached.name,
            updated: cached.updated,
            indexed: cached.indexed,
            favorited: cached.favorited,
            public_id: cached.publicId,
            post_count: cached.postCount,
          }) as UnifiedCreator,
          source: "cache" as const,
        };
      }

      const live = await fetchCreatorProfileLive(input.site, input.service, input.creatorId);
      if (live) {
        await repository.upsertCreatorProfile({
          site: input.site,
          service: input.service,
          creatorId: input.creatorId,
          name: live.name,
          favorited: Number(live.favorited ?? 0),
          updated: live.updated,
          indexed: live.indexed,
          publicId: live.public_id ?? null,
          postCount: live.post_count ?? null,
          profileImageUrl: proxyCdnUrl(input.site, `/icons/${input.service}/${input.creatorId}`),
          bannerImageUrl: proxyCdnUrl(input.site, `/banners/${input.service}/${input.creatorId}`),
          rawPreviewPayload: live,
          syncedAt: new Date(),
        });
      }

      return {
        profile: live,
        source: live ? (cached ? "live-refresh" : "live") : "empty",
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
      if (!query) {
        const cached = await repository.listCreatorPosts({
          site: input.site,
          service: input.service,
          creatorId: input.creatorId,
          offset: input.offset,
          limit: 50,
          freshOnly: true,
        });
        if (cached.length >= 50) {
          return {
            posts: cached.map((post) => mapCachedPostToUnifiedPost(post)).filter((post): post is UnifiedPost => Boolean(post)),
            source: "cache" as const,
          };
        }
      }

      const live = await fetchCreatorPostsLive(input.site, input.service, input.creatorId, input.offset, input.cookie, query);
      const hydratedLive = await hydratePostsWithCachedPreviewAssets(live, {
        repository,
      });
      await Promise.all(
        hydratedLive.map((post) =>
          repository.upsertPostCache(
            createPostCacheInputFromUnifiedPost(post as UnifiedPost, query ? "search-query" : "creator-page", "metadata")
          )
        )
      );

      return {
        posts: hydratedLive,
        source: "live" as const,
      };
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
          return {
            post,
            source: "cache" as const,
          };
        }
      }

      const live = await fetchPostLive(input);
      const hydratedLive = await hydratePostWithCachedPreviewAssets(live, {
        repository,
      });
      await repository.upsertPostCache(createPostCacheInputFromUnifiedPost(hydratedLive as UnifiedPost, "post-detail", "full"));

      return {
        post: hydratedLive,
        source: cached ? "live-refresh" as const : "live" as const,
      };
    },
  };
}









