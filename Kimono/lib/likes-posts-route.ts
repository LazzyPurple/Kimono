import { createHybridContentService } from "./hybrid-content.ts";
import { buildFavoriteChronologyMap, createFavoriteChronologyKey, type FavoritePostListItem } from "./favorites-page-state.ts";
import type { FavoriteChronologyRecord } from "./favorites-page-state.ts";
import type { SupportedSite, StoredKimonoSession } from "./data-store.ts";
import { getDataStore } from "./data-store.ts";
import { loadStoredKimonoSessionRecord } from "./remote-session.ts";
import { hydratePostsWithMediaPlatform } from "./post-preview-hydration.ts";
import { getPerformanceRepository } from "./perf-repository.ts";
import type { UnifiedPost } from "./api/helpers.ts";
import { readSessionUpstreamCache } from "./session-upstream-cache.ts";

const FAVORITE_POSTS_FRESH_TTL_MS = 45_000;
const FAVORITE_POSTS_STALE_TTL_MS = 10 * 60 * 1000;

export interface LikesPostsPayload {
  loggedIn: boolean;
  expired: boolean;
  username: string | null;
  items: FavoritePostListItem[];
}

interface LikesPostsDependencies {
  site: SupportedSite;
  loadSession?: (site: SupportedSite) => Promise<StoredKimonoSession | null>;
  fetchFavoritePosts?: (input: { site: SupportedSite; cookie: string }) => Promise<UnifiedPost[]>;
  hydratePosts?: (posts: UnifiedPost[]) => Promise<UnifiedPost[]>;
  listFavoriteChronology?: (input: { kind: "post"; site: SupportedSite }) => Promise<FavoriteChronologyRecord[]>;
  resolveCreatorNames?: (posts: UnifiedPost[]) => Promise<Map<string, string>>;
  readSnapshot?: (site: SupportedSite) => Promise<UnifiedPost[] | { posts: UnifiedPost[]; updatedAt: Date | null }>;
  writeSnapshot?: (site: SupportedSite, posts: UnifiedPost[]) => Promise<void>;
}

const hybridContent = createHybridContentService();

function normalizeFavoritePostSnapshotResult(
  snapshot: UnifiedPost[] | { posts: UnifiedPost[]; updatedAt: Date | null }
): { posts: UnifiedPost[]; updatedAt: Date | null } {
  if (Array.isArray(snapshot)) {
    return { posts: snapshot, updatedAt: null };
  }

  return {
    posts: Array.isArray(snapshot.posts) ? snapshot.posts : [],
    updatedAt: snapshot.updatedAt ?? null,
  };
}

function mapFavoritePosts(
  posts: UnifiedPost[],
  chronologyEntries: FavoriteChronologyRecord[],
  creatorNames: Map<string, string>,
  snapshotUpdatedAt: Date | null,
  stale: boolean
): FavoritePostListItem[] {
  const chronologyByKey = buildFavoriteChronologyMap(chronologyEntries);
  return posts.map((post, index) => {
    const chronology = chronologyByKey.get(
      createFavoriteChronologyKey({
        kind: "post",
        site: post.site,
        service: post.service,
        creatorId: post.user,
        postId: post.id,
      })
    );
    const retainedDate = typeof (post as { favoriteAddedAt?: string | null }).favoriteAddedAt === "string"
      ? (post as { favoriteAddedAt?: string | null }).favoriteAddedAt ?? null
      : null;
    const favoriteAddedAt = chronology?.favoritedAt.toISOString() ?? retainedDate;
    const favoriteOrderSource = chronology
      ? "exact"
      : retainedDate
        ? "retained"
        : "fallback";

    return {
      ...post,
      creatorName: creatorNames.get(`${post.site}:${post.service}:${post.user}`) ?? null,
      favoriteAddedAt,
      favoriteDateKnown: favoriteOrderSource !== "fallback",
      favoriteOrderSource,
      favoriteSourceIndex: typeof (post as { favoriteSourceIndex?: number }).favoriteSourceIndex === "number"
        ? (post as { favoriteSourceIndex?: number }).favoriteSourceIndex ?? index
        : index,
      snapshotUpdatedAt: snapshotUpdatedAt?.toISOString() ?? null,
      stale,
    } satisfies FavoritePostListItem;
  });
}

async function readFavoritePostSnapshot(site: SupportedSite): Promise<{ posts: UnifiedPost[]; updatedAt: Date | null }> {
  const store = await getDataStore();
  try {
    const snapshot = await store.getFavoriteSnapshot({ kind: "post", site });
    if (!snapshot?.data) {
      return { posts: [], updatedAt: null };
    }
    const parsed = JSON.parse(snapshot.data);
    return {
      posts: Array.isArray(parsed) ? parsed : [],
      updatedAt: snapshot.updatedAt ?? null,
    };
  } catch {
    return { posts: [], updatedAt: null };
  } finally {
    await store.disconnect();
  }
}

async function writeFavoritePostSnapshot(site: SupportedSite, posts: UnifiedPost[]): Promise<void> {
  const store = await getDataStore();
  try {
    await store.setFavoriteSnapshot({
      kind: "post",
      site,
      data: posts,
      updatedAt: new Date(),
    });
  } finally {
    await store.disconnect();
  }
}

async function defaultFetchFavoritePosts(input: { site: SupportedSite; cookie: string }): Promise<UnifiedPost[]> {
  const cached = await readSessionUpstreamCache<UnifiedPost[]>({
    keyParts: ["favorites", "posts", input.site, input.cookie],
    freshTtlMs: FAVORITE_POSTS_FRESH_TTL_MS,
    staleTtlMs: FAVORITE_POSTS_STALE_TTL_MS,
    loader: async () => {
      const api = input.site === "kemono"
        ? await import("./api/kemono.ts")
        : await import("./api/coomer.ts");
      const posts = await api.fetchFavoritePosts(input.cookie);
      return posts.map((post) => ({ ...post, site: input.site }));
    },
  });

  return cached.value;
}

async function defaultHydratePosts(posts: UnifiedPost[]): Promise<UnifiedPost[]> {
  const repository = await getPerformanceRepository();
  return hydratePostsWithMediaPlatform(posts, {
    repository,
    context: "favorites-posts",
    resolvePriorityClass: () => "liked",
  });
}

async function defaultListFavoriteChronology(input: { kind: "post"; site: SupportedSite }): Promise<FavoriteChronologyRecord[]> {
  const store = await getDataStore();
  try {
    return await store.listFavoriteChronology(input);
  } finally {
    await store.disconnect();
  }
}

async function defaultResolveCreatorNames(posts: UnifiedPost[]): Promise<Map<string, string>> {
  const uniqueCreators = Array.from(new Set(posts.map((post) => `${post.site}:${post.service}:${post.user}`)));
  const entries = await Promise.all(
    uniqueCreators.map(async (key): Promise<[string, string | null]> => {
      const [site, service, creatorId] = key.split(":");
      const result = await hybridContent.getCreatorProfile({
        site: site as SupportedSite,
        service,
        creatorId,
      });
      return [key, result.profile?.name ?? null];
    })
  );

  return new Map(
    entries.filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

export async function getLikesPostsPayload(dependencies: LikesPostsDependencies): Promise<LikesPostsPayload> {
  const loadSession = dependencies.loadSession ?? ((site) => loadStoredKimonoSessionRecord(site));
  const session = await loadSession(dependencies.site);
  if (!session) {
    return {
      loggedIn: false,
      expired: false,
      username: null,
      items: [],
    };
  }

  const fetchFavoritePosts = dependencies.fetchFavoritePosts ?? defaultFetchFavoritePosts;
  const hydratePosts = dependencies.hydratePosts ?? defaultHydratePosts;
  const listFavoriteChronology = dependencies.listFavoriteChronology ?? defaultListFavoriteChronology;
  const resolveCreatorNames = dependencies.resolveCreatorNames ?? defaultResolveCreatorNames;
  const readSnapshot = dependencies.readSnapshot ?? readFavoritePostSnapshot;
  const writeSnapshot = dependencies.writeSnapshot ?? writeFavoritePostSnapshot;

  try {
    const rawPosts = await fetchFavoritePosts({ site: dependencies.site, cookie: session.cookie });
    const posts = rawPosts.map((post, index) => ({ ...post, site: dependencies.site, favoriteSourceIndex: index }));
    const [hydratedPosts, chronologyEntries, creatorNames] = await Promise.all([
      hydratePosts(posts),
      listFavoriteChronology({ kind: "post", site: dependencies.site }),
      resolveCreatorNames(posts),
    ]);
    const items = mapFavoritePosts(hydratedPosts, chronologyEntries, creatorNames, new Date(), false);
    void writeSnapshot(dependencies.site, hydratedPosts).catch(() => undefined);

    return {
      loggedIn: true,
      expired: false,
      username: session.username ?? null,
      items,
    };
  } catch {
    const snapshotResult = normalizeFavoritePostSnapshotResult(await readSnapshot(dependencies.site));
    const [chronologyEntries, creatorNames] = await Promise.all([
      listFavoriteChronology({ kind: "post", site: dependencies.site }),
      resolveCreatorNames(snapshotResult.posts),
    ]);

    if (snapshotResult.posts.length > 0) {
      return {
        loggedIn: true,
        expired: true,
        username: session.username ?? null,
        items: mapFavoritePosts(snapshotResult.posts, chronologyEntries, creatorNames, snapshotResult.updatedAt, true),
      };
    }

    return {
      loggedIn: false,
      expired: true,
      username: session.username ?? null,
      items: [],
    };
  }
}

