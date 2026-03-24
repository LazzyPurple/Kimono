import { createRequire } from "node:module";

import { getDataStore, type SupportedSite } from "./data-store.ts";
import { getPerformanceRepository, type PerformanceRepository } from "./perf-repository.ts";
import { getGlobalUpstreamRateGuard, type UpstreamCooldownSnapshotEntry } from "./api/upstream-rate-guard.ts";

const require = createRequire(import.meta.url);
const { collectStartupDiagnostics } = require("./server/startup.cjs");

const SITES = ["kemono", "coomer"] as const satisfies SupportedSite[];

type StartupDiagnostics = ReturnType<typeof collectStartupDiagnostics>;

type DataStoreLike = Awaited<ReturnType<typeof getDataStore>>;

interface ServerHealthDependencies {
  collectStartupDiagnostics?: () => StartupDiagnostics;
  getRateGuardSnapshot?: () => UpstreamCooldownSnapshotEntry[];
  getStore?: () => Promise<DataStoreLike>;
  getRepository?: () => Promise<PerformanceRepository>;
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

export function createServerHealthService(dependencies: ServerHealthDependencies = {}) {
  const collectDiagnostics = dependencies.collectStartupDiagnostics ?? (() => collectStartupDiagnostics({ appDir: process.cwd(), cwd: process.cwd(), env: process.env }));
  const getRateGuardSnapshot = dependencies.getRateGuardSnapshot ?? (() => getGlobalUpstreamRateGuard().snapshot());
  const getStore = dependencies.getStore ?? getDataStore;
  const getRepository = dependencies.getRepository ?? getPerformanceRepository;

  return {
    async getSnapshot() {
      const diagnostics = collectDiagnostics();
      const upstreamCooldowns = getRateGuardSnapshot().map((entry) => ({
        ...entry,
        blockedUntilIso: new Date(entry.blockedUntil).toISOString(),
      }));

      const store = await getStore();
      let favoritesBySite = {} as Record<SupportedSite, { creators: number; posts: number; updatedAt: string | null }>;
      let discovery = { cached: false, total: 0, updatedAt: null as string | null };

      try {
        const entries = await Promise.all(SITES.map(async (site) => {
          const [creatorSnapshot, postsSnapshot] = await Promise.all([
            store.getFavoriteSnapshot({ kind: "creator", site }),
            store.getFavoriteSnapshot({ kind: "post", site }),
          ]);
          return [site, {
            creators: parseArrayCount(creatorSnapshot?.data),
            posts: parseArrayCount(postsSnapshot?.data),
            updatedAt: toIso(creatorSnapshot?.updatedAt ?? postsSnapshot?.updatedAt ?? null),
          }] as const;
        }));
        favoritesBySite = Object.fromEntries(entries) as Record<SupportedSite, { creators: number; posts: number; updatedAt: string | null }>;

        const discoveryCache = await store.getDiscoveryCache("global");
        discovery = {
          cached: Boolean(discoveryCache?.data),
          total: parseArrayCount(discoveryCache?.data),
          updatedAt: toIso(discoveryCache?.updatedAt ?? null),
        };
      } finally {
        await store.disconnect();
      }

      const repository = await getRepository();
      let creatorIndex = {} as Record<SupportedSite, { total: number; snapshotFresh: boolean; syncedAt: string | null }>;
      let mediaSources = {
        totalEntries: 0,
        totalSizeBytes: 0,
        readyEntries: 0,
        remoteHttpErrors: 0,
        toolMissing: 0,
      };
      let previews = {
        totalEntries: 0,
        readyEntries: 0,
        partialEntries: 0,
        failedEntries: 0,
      };
      try {
        const [entries, mediaSourceStats, previewStats] = await Promise.all([
          Promise.all(SITES.map(async (site) => {
            const result = await repository.searchCreatorsPage({
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
          })),
          repository.getMediaSourceCacheStats(),
          repository.getPreviewAssetStats(),
        ]);
        creatorIndex = Object.fromEntries(entries) as Record<SupportedSite, { total: number; snapshotFresh: boolean; syncedAt: string | null }>;
        mediaSources = mediaSourceStats;
        previews = previewStats;
      } finally {
        await repository.disconnect();
      }

      return {
        generatedAt: new Date().toISOString(),
        runtime: diagnostics.runtime,
        paths: diagnostics.paths,
        environment: diagnostics.environment,
        upstreamCooldowns,
        favorites: favoritesBySite,
        discovery,
        creatorIndex,
        mediaSources,
        previews,
      };
    },
  };
}

export async function getServerHealthPayload() {
  return createServerHealthService().getSnapshot();
}
