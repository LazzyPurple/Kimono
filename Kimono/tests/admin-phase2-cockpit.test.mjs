import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  createAdminDashboardService,
} from "../lib/admin/admin-dashboard.ts";
import {
  ADMIN_DB_TABLES,
  createAdminDbService,
} from "../lib/admin/admin-db.ts";
import { createAdminSessionsService } from "../lib/admin/admin-sessions.ts";
import { createAdminActionsService } from "../lib/admin/admin-actions.ts";

test("phase 2 admin cockpit pages exist under /admin", () => {
  const expectedPages = [
    "../app/(main)/admin/layout.tsx",
    "../app/(main)/admin/page.tsx",
    "../app/(main)/admin/logs/page.tsx",
    "../app/(main)/admin/db/page.tsx",
    "../app/(main)/admin/actions/page.tsx",
    "../app/(main)/admin/sessions/page.tsx",
    "../app/(main)/admin/health/page.tsx",
  ];

  for (const relativePath of expectedPages) {
    assert.equal(existsSync(new URL(relativePath, import.meta.url)), true, `${relativePath} should exist`);
  }

  const layoutSource = readFileSync(new URL("../app/(main)/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(layoutSource, /AdminSidebar/);

  const dashboardSource = readFileSync(new URL("../app/(main)/admin/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboardSource, /Temporary lune diagnostics/i);
  assert.match(dashboardSource, /Dashboard/i);
});

test("admin dashboard service aggregates postgres runtime stats and creator sync data", async () => {
  const service = createAdminDashboardService({
    getServerHealth: async () => ({
      runtime: {
        database: { configured: true, driver: "postgres" },
        previewTools: {
          ffmpeg: { status: "missing" },
          ffprobe: { status: "missing" },
        },
      },
      creatorIndex: {
        kemono: { total: 31500, snapshotFresh: true, syncedAt: "2026-04-03T10:15:00.000Z" },
        coomer: { total: 220005, snapshotFresh: false, syncedAt: "2026-04-03T10:16:00.000Z" },
      },
      mediaSources: {
        readyEntries: 5,
        totalSizeBytes: 645800000,
      },
      previews: {
        readyEntries: 42,
      },
      upstreamCooldowns: [{ site: "coomer", bucket: "discover", retryAfterMs: 12000 }],
      favorites: {
        kemono: { creators: 2, posts: 4, updatedAt: "2026-04-03T10:20:00.000Z" },
        coomer: { creators: 1, posts: 9, updatedAt: "2026-04-03T10:21:00.000Z" },
      },
      discovery: {
        cached: true,
        total: 25,
        updatedAt: "2026-04-03T10:22:00.000Z",
      },
    }),
    getCounts: async () => ({
      kemonoCreators: 31500,
      coomerCreators: 220005,
      activeSessions: 2,
    }),
    getMediaDiskUsage: async () => 645800000,
    getBootPolicyLabel: () => "manual-db-reset-only",
  });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.runtime.databaseDriver, "postgres");
  assert.equal(snapshot.cards.kemonoCreators, 31500);
  assert.equal(snapshot.cards.coomerCreators, 220005);
  assert.equal(snapshot.cards.activeSessions, 2);
  assert.equal(snapshot.cards.generatedPreviews, 42);
  assert.equal(snapshot.cards.cachedVideoSources, 5);
  assert.equal(snapshot.cards.mediaDiskBytes, 645800000);
  assert.equal(snapshot.creatorSync.kemono.snapshotFresh, true);
  assert.equal(snapshot.creatorSync.coomer.snapshotFresh, false);
  assert.equal(snapshot.bootPolicy, "manual-db-reset-only");
});

test("admin db service exposes whitelisted table stats and creator paging", async () => {
  const service = createAdminDbService({
    getTableStats: async () => ({
      Creator: { rows: 328000, sizeBytes: 1024, sampleRows: [{ creatorId: "1" }] },
      Post: { rows: 10000, sizeBytes: 2048, sampleRows: [{ postId: "99" }] },
      MediaAsset: { rows: 5, sizeBytes: 64, sampleRows: [] },
      MediaSource: { rows: 2, sizeBytes: 128, sampleRows: [] },
      FavoriteChronology: { rows: 12, sizeBytes: 96, sampleRows: [] },
      FavoriteCache: { rows: 4, sizeBytes: 48, sampleRows: [] },
      DiscoveryCache: { rows: 1, sizeBytes: 24, sampleRows: [] },
      DiscoveryBlock: { rows: 0, sizeBytes: 16, sampleRows: [] },
      KimonoSession: { rows: 2, sizeBytes: 32, sampleRows: [] },
      User: { rows: 1, sizeBytes: 64, sampleRows: [] },
      Session: { rows: 1, sizeBytes: 64, sampleRows: [] },
      Passkey: { rows: 0, sizeBytes: 16, sampleRows: [] },
    }),
    searchCreators: async () => ({
      rows: [{ creatorId: "37736", name: "Anna Anon", site: "kemono", service: "fanbox" }],
      total: 1,
      snapshotFresh: true,
    }),
  });

  const snapshot = await service.getSnapshot({
    q: "anna",
    page: 2,
    perPage: 50,
    sort: "updated",
    order: "desc",
  });

  assert.deepEqual(snapshot.tables.map((table) => table.key), ADMIN_DB_TABLES);
  assert.equal(snapshot.tables[0].rows, 328000);
  assert.equal(snapshot.creatorSearch.total, 1);
  assert.equal(snapshot.creatorSearch.page, 2);
  assert.equal(snapshot.creatorSearch.perPage, 50);
});

test("admin sessions service exposes kimono sessions and totp status", async () => {
  const service = createAdminSessionsService({
    getKimonoSessions: async () => ([
      { site: "kemono", username: "anna", savedAt: new Date("2026-04-03T10:00:00.000Z") },
      { site: "coomer", username: "bunny", savedAt: new Date("2026-04-03T10:05:00.000Z") },
    ]),
    getAuthSnapshot: async () => ({
      database: {
        ok: true,
        adminUser: { exists: true, totpEnabled: true },
      },
    }),
  });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.sessions.length, 2);
  assert.equal(snapshot.totpEnabled, true);
  assert.equal(snapshot.sessions[0].site, "coomer");
});

test("admin actions service dispatches maintenance actions", async () => {
  const calls = [];
  const service = createAdminActionsService({
    resetDb: async () => {
      calls.push("reset-db");
      return { message: "Reset ok" };
    },
    resyncCreatorIndex: async () => {
      calls.push("resync-creator-index");
      return { message: "Creator sync ok" };
    },
    resyncPopular: async () => {
      calls.push("resync-popular");
      return { message: "Popular sync ok" };
    },
    resyncFavorites: async () => {
      calls.push("resync-favorites");
      return { message: "Favorites sync ok" };
    },
    purgeMedia: async () => {
      calls.push("purge-media");
      return { message: "Purge ok" };
    },
    clearCooldown: async () => {
      calls.push("clear-cooldown");
      return { message: "Cooldown cleared" };
    },
  });

  const result = await service.run("resync-creator-index");

  assert.equal(result.message, "Creator sync ok");
  assert.deepEqual(calls, ["resync-creator-index"]);
});
