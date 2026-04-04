import startupModule from "./server/startup.cjs";

import { db, withDbConnection, type KimonoSite } from "./db/index.ts";
import { getGlobalUpstreamRateGuard, type UpstreamCooldownSnapshotEntry } from "./api/upstream-rate-guard.ts";

const { collectStartupDiagnostics } = startupModule;

const SITES = ["kemono", "coomer"] as const satisfies KimonoSite[];

type StartupDiagnostics = ReturnType<typeof collectStartupDiagnostics>;

type RawRecord = Record<string, unknown>;

type SnapshotStoreLike = {
  getFavoriteCacheSnapshot: (input: { kind: "creator" | "post"; site: KimonoSite }) => Promise<{ data: string | null; updatedAt: Date | null } | null>;
  getDiscoveryCache: (site: KimonoSite | "global") => Promise<{ data: string | null; updatedAt: Date | null } | null>;
  disconnect?: () => Promise<void>;
};

type SnapshotRepositoryLike = {
  searchCreatorCatalogPage: (input: { q: string; filter: KimonoSite; sort: string; service: string; page: number; perPage: number; likedCreatorKeys: string[] }) => Promise<{ total: number; snapshotFresh: boolean; syncedAt: Date | null }>;
  getMediaSourceStatsSnapshot: () => Promise<{ totalEntries: number; totalSizeBytes: number; readyEntries: number; remoteHttpErrors: number; toolMissing: number }>;
  getPreviewStatsSnapshot: () => Promise<{ totalEntries: number; readyEntries: number; partialEntries: number; failedEntries: number }>;
  disconnect?: () => Promise<void>;
};

interface ServerHealthDependencies {
  collectStartupDiagnostics?: () => StartupDiagnostics;
  getRateGuardSnapshot?: () => UpstreamCooldownSnapshotEntry[];
  getStore?: () => Promise<SnapshotStoreLike>;
  getRepository?: () => Promise<SnapshotRepositoryLike>;
}

function parseArrayCount(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

async function queryRows<T = RawRecord>(sql: string, values: unknown[] = []): Promise<T[]> {
  return withDbConnection(async (conn) => {
    const [rows] = await conn.query(sql, values as never[]);
    return rows as T[];
  });
}

async function getCreatorCatalogSnapshot(site: KimonoSite) {
  const [stats] = await Promise.all([
    queryRows<{ total: number; syncedAt: Date | null }>(
      "SELECT COUNT(*) AS total, MAX(catalogSyncedAt) AS syncedAt FROM `Creator` WHERE site = ? AND archivedAt IS NULL",
      [site]
    ),
  ]);
  const fresh = await withDbConnection((conn) => db.isCreatorCatalogFresh(conn as never, site));
  return {
    total: Number(stats[0]?.total ?? 0),
    snapshotFresh: fresh,
    syncedAt: toIso(stats[0]?.syncedAt ?? null),
  };
}

async function getFavoriteCacheSnapshot(site: KimonoSite) {
  const [creatorCache, postCache] = await Promise.all([
    withDbConnection((conn) => db.getFavoriteCache(conn as never, "creator", site)),
    withDbConnection((conn) => db.getFavoriteCache(conn as never, "post", site)),
  ]);

  return {
    creators: parseArrayCount(creatorCache?.payloadJson),
    posts: parseArrayCount(postCache?.payloadJson),
    updatedAt: toIso(creatorCache?.updatedAt ?? postCache?.updatedAt ?? null),
  };
}

async function getDiscoverySnapshot() {
  const entry = await withDbConnection((conn) => db.getDiscoveryCache(conn as never, "global"));
  return {
    cached: Boolean(entry?.payloadJson),
    total: parseArrayCount(entry?.payloadJson),
    updatedAt: toIso(entry?.updatedAt ?? null),
  };
}

async function getMediaSourceStats() {
  const rows = await queryRows<{
    totalEntries: number;
    totalSizeBytes: number;
    readyEntries: number;
    remoteHttpErrors: number;
    toolMissing: number;
  }>(
    `SELECT
      COUNT(*) AS totalEntries,
      COALESCE(SUM(fileSizeBytes), 0) AS totalSizeBytes,
      COALESCE(SUM(CASE WHEN downloadStatus = 'ready' THEN 1 ELSE 0 END), 0) AS readyEntries,
      COALESCE(SUM(CASE WHEN downloadStatus = 'remote-http-error' THEN 1 ELSE 0 END), 0) AS remoteHttpErrors,
      COALESCE(SUM(CASE WHEN downloadStatus = 'tool-missing' THEN 1 ELSE 0 END), 0) AS toolMissing
     FROM \`MediaSource\``
  );

  return {
    totalEntries: Number(rows[0]?.totalEntries ?? 0),
    totalSizeBytes: Number(rows[0]?.totalSizeBytes ?? 0),
    readyEntries: Number(rows[0]?.readyEntries ?? 0),
    remoteHttpErrors: Number(rows[0]?.remoteHttpErrors ?? 0),
    toolMissing: Number(rows[0]?.toolMissing ?? 0),
  };
}

async function getPreviewStats() {
  const rows = await queryRows<{
    totalEntries: number;
    readyEntries: number;
    partialEntries: number;
    failedEntries: number;
  }>(
    `SELECT
      COUNT(*) AS totalEntries,
      COALESCE(SUM(CASE WHEN previewStatus IN ('thumbnail-ready', 'clip-ready') THEN 1 ELSE 0 END), 0) AS readyEntries,
      COALESCE(SUM(CASE WHEN previewStatus = 'thumbnail-ready' THEN 1 ELSE 0 END), 0) AS partialEntries,
      COALESCE(SUM(CASE WHEN previewStatus = 'error' THEN 1 ELSE 0 END), 0) AS failedEntries
     FROM \`MediaAsset\``
  );

  return {
    totalEntries: Number(rows[0]?.totalEntries ?? 0),
    readyEntries: Number(rows[0]?.readyEntries ?? 0),
    partialEntries: Number(rows[0]?.partialEntries ?? 0),
    failedEntries: Number(rows[0]?.failedEntries ?? 0),
  };
}

export function createServerHealthService(dependencies: ServerHealthDependencies = {}) {
  const collectDiagnostics = dependencies.collectStartupDiagnostics ?? (() => collectStartupDiagnostics({ cwd: process.cwd(), env: process.env }));
  const getRateGuardSnapshot = dependencies.getRateGuardSnapshot ?? (() => getGlobalUpstreamRateGuard().snapshot());

  return {
    async getSnapshot() {
      const diagnostics = collectDiagnostics();
      const upstreamCooldowns = getRateGuardSnapshot().map((entry) => ({
        ...entry,
        blockedUntilIso: new Date(entry.blockedUntil).toISOString(),
      }));

      let favoritesEntries: Array<readonly [KimonoSite, { creators: number; posts: number; updatedAt: string | null }]>;
      let discovery: { cached: boolean; total: number; updatedAt: string | null };
      if (dependencies.getStore) {
        const store = await dependencies.getStore();
        try {
          favoritesEntries = await Promise.all(SITES.map(async (site) => {
            const [creatorSnapshot, postsSnapshot] = await Promise.all([
              store.getFavoriteCacheSnapshot({ kind: "creator", site }),
              store.getFavoriteCacheSnapshot({ kind: "post", site }),
            ]);
            return [site, {
              creators: parseArrayCount(creatorSnapshot?.data ?? null),
              posts: parseArrayCount(postsSnapshot?.data ?? null),
              updatedAt: toIso(creatorSnapshot?.updatedAt ?? postsSnapshot?.updatedAt ?? null),
            }] as const;
          }));
          const discoveryCache = await store.getDiscoveryCache("global");
          discovery = {
            cached: Boolean(discoveryCache?.data),
            total: parseArrayCount(discoveryCache?.data ?? null),
            updatedAt: toIso(discoveryCache?.updatedAt ?? null),
          };
        } finally {
          await store.disconnect?.();
        }
      } else {
        [favoritesEntries, discovery] = await Promise.all([
          Promise.all(SITES.map(async (site) => [site, await getFavoriteCacheSnapshot(site)] as const)),
          getDiscoverySnapshot(),
        ]);
      }

      let creatorIndexEntries: Array<readonly [KimonoSite, { total: number; snapshotFresh: boolean; syncedAt: string | null }]>;
      let mediaSources: Awaited<ReturnType<typeof getMediaSourceStats>>;
      let previews: Awaited<ReturnType<typeof getPreviewStats>>;
      if (dependencies.getRepository) {
        const repository = await dependencies.getRepository();
        try {
          creatorIndexEntries = await Promise.all(SITES.map(async (site) => {
            const result = await repository.searchCreatorCatalogPage({
              q: "",
              filter: site,
              sort: "favorites",
              service: "Tous",
              page: 1,
              perPage: 1,
              likedCreatorKeys: [],
            });
            return [site, {
              total: result.total,
              snapshotFresh: result.snapshotFresh,
              syncedAt: toIso(result.syncedAt),
            }] as const;
          }));
          [mediaSources, previews] = await Promise.all([
            repository.getMediaSourceStatsSnapshot(),
            repository.getPreviewStatsSnapshot(),
          ]);
        } finally {
          await repository.disconnect?.();
        }
      } else {
        [creatorIndexEntries, mediaSources, previews] = await Promise.all([
          Promise.all(SITES.map(async (site) => [site, await getCreatorCatalogSnapshot(site)] as const)),
          getMediaSourceStats(),
          getPreviewStats(),
        ]);
      }

      return {
        generatedAt: new Date().toISOString(),
        runtime: diagnostics.runtime,
        paths: diagnostics.paths,
        environment: diagnostics.environment,
        upstreamCooldowns,
        favorites: Object.fromEntries(favoritesEntries),
        discovery,
        creatorIndex: Object.fromEntries(creatorIndexEntries),
        mediaSources,
        previews,
      };
    },
  };
}

export async function getServerHealthPayload() {
  return createServerHealthService().getSnapshot();
}

