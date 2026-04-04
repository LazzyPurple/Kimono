import test from "node:test";
import assert from "node:assert/strict";

import { createServerHealthService } from "../lib/server-health.ts";

test("server health service aggregates runtime, cooldowns and local snapshot stats", async () => {
  const service = createServerHealthService({
    collectStartupDiagnostics: () => ({
      runtime: {
        database: { configured: true, driver: "postgres" },
        sessionStore: { configured: true, mode: "database" },
        previewTools: {
          ffmpeg: { status: "configured", resolvedPath: "/usr/bin/ffmpeg", source: "env" },
          ffprobe: { status: "missing", resolvedPath: null, source: "path" },
        },
      },
      paths: { appDir: true, nodeModules: true },
      environment: { DATABASE_URL: true },
    }),
    getRateGuardSnapshot: () => ([
      { site: "coomer", bucket: "discover", blockedUntil: Date.UTC(2026, 2, 20, 12, 10, 0), retryAfterMs: 12000 },
    ]),
    getStore: async () => ({
      getFavoriteCacheSnapshot: async ({ kind, site }) => ({
        data: kind === "creator" ? JSON.stringify([{ id: `${site}-creator` }]) : JSON.stringify([{ id: `${site}-post` }, { id: `${site}-post-2` }]),
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      }),
      getDiscoveryCache: async () => ({
        data: JSON.stringify([{ id: "rec-1" }, { id: "rec-2" }]),
        updatedAt: new Date("2026-03-20T12:05:00.000Z"),
      }),
      disconnect: async () => undefined,
    }),
    getRepository: async () => ({
      searchCreatorCatalogPage: async ({ filter }) => ({
        items: [],
        total: filter === "kemono" ? 10 : 20,
        page: 1,
        perPage: 1,
        services: [],
        snapshotFresh: filter === "kemono",
        syncedAt: new Date("2026-03-20T11:00:00.000Z"),
      }),
      getMediaSourceStatsSnapshot: async () => ({
        totalEntries: 3,
        totalSizeBytes: 123456789,
        readyEntries: 2,
        remoteHttpErrors: 1,
        toolMissing: 0,
      }),
      getPreviewStatsSnapshot: async () => ({
        totalEntries: 4,
        readyEntries: 2,
        partialEntries: 1,
        failedEntries: 1,
      }),
      disconnect: async () => undefined,
    }),
  });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.runtime.database.driver, "postgres");
  assert.equal(snapshot.upstreamCooldowns.length, 1);
  assert.equal(snapshot.favorites.kemono.creators, 1);
  assert.equal(snapshot.favorites.coomer.posts, 2);
  assert.equal(snapshot.discovery.total, 2);
  assert.equal(snapshot.creatorIndex.kemono.total, 10);
  assert.equal(snapshot.creatorIndex.coomer.snapshotFresh, false);
  assert.equal(snapshot.mediaSources.totalEntries, 3);
  assert.equal(snapshot.mediaSources.totalSizeBytes, 123456789);
  assert.equal(snapshot.mediaSources.readyEntries, 2);
  assert.equal(snapshot.previews.readyEntries, 2);
});

