import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createLocalPerformanceRepository } from "../lib/perf-repository.ts";

function createTempDatabaseCopy() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-perf-"));
  const dbPath = path.join(tempDir, "dev.db");
  fs.copyFileSync(path.join(process.cwd(), "prisma", "dev.db"), dbPath);

  return {
    tempDir,
    databaseUrl: `file:${dbPath.replace(/\\/g, "/")}`,
  };
}

test("local performance repository replaces a site creator snapshot and pages indexed creators", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const repository = await createLocalPerformanceRepository({ databaseUrl });

  t.after(async () => {
    await repository.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const syncedAt = new Date();

  await repository.replaceCreatorSnapshot({
    site: "kemono",
    syncedAt,
    creators: [
      {
        site: "kemono",
        service: "patreon",
        creatorId: "100",
        name: "Belle Delphine",
        favorited: 1000,
        updated: "2026-03-12T12:00:00.000Z",
        indexed: "2026-03-12T12:00:00.000Z",
      },
      {
        site: "kemono",
        service: "fanbox",
        creatorId: "101",
        name: "Maplestar",
        favorited: 2000,
        updated: "2026-03-13T12:00:00.000Z",
        indexed: "2026-03-13T12:00:00.000Z",
      },
    ],
  });

  const page = await repository.searchCreatorsPage({
    q: "maple",
    filter: "kemono",
    sort: "favorites",
    service: "Tous",
    page: 1,
    perPage: 50,
  });

  assert.equal(page.total, 1);
  assert.equal(page.items[0]?.name, "Maplestar");
  assert.deepEqual(page.services, ["fanbox", "patreon"]);
  assert.equal(page.snapshotFresh, true);
});

test("local performance repository caches creator posts and returns them by newest first", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const repository = await createLocalPerformanceRepository({ databaseUrl });

  t.after(async () => {
    await repository.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await repository.upsertPostCache({
    site: "kemono",
    service: "patreon",
    creatorId: "100",
    postId: "2",
    title: "Newer",
    excerpt: "new",
    publishedAt: "2026-03-13T10:00:00.000Z",
    rawPreviewPayload: { id: "2", title: "Newer" },
    detailLevel: "metadata",
    sourceKind: "recent_view",
    cachedAt: new Date("2026-03-13T10:00:00.000Z"),
    expiresAt: new Date("2026-03-13T11:00:00.000Z"),
  });
  await repository.upsertPostCache({
    site: "kemono",
    service: "patreon",
    creatorId: "100",
    postId: "1",
    title: "Older",
    excerpt: "old",
    publishedAt: "2026-03-12T10:00:00.000Z",
    rawPreviewPayload: { id: "1", title: "Older" },
    detailLevel: "metadata",
    sourceKind: "recent_view",
    cachedAt: new Date("2026-03-13T10:00:00.000Z"),
    expiresAt: new Date("2026-03-13T11:00:00.000Z"),
  });

  const posts = await repository.listCreatorPosts({
    site: "kemono",
    service: "patreon",
    creatorId: "100",
    offset: 0,
    limit: 50,
    freshOnly: true,
    now: new Date("2026-03-13T10:30:00.000Z"),
  });

  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.postId, "2");
  assert.equal(posts[1]?.postId, "1");
});

test("local performance repository stores popular snapshots against canonical post cache rows", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const repository = await createLocalPerformanceRepository({ databaseUrl });

  t.after(async () => {
    await repository.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await repository.upsertPostCache({
    site: "kemono",
    service: "patreon",
    creatorId: "100",
    postId: "1",
    title: "Warm popular",
    excerpt: "hot",
    publishedAt: "2026-03-13T09:00:00.000Z",
    rawPreviewPayload: { id: "1", title: "Warm popular" },
    detailLevel: "metadata",
    sourceKind: "popular",
    cachedAt: new Date("2026-03-13T10:00:00.000Z"),
    expiresAt: new Date("2026-03-13T11:00:00.000Z"),
  });

  await repository.replacePopularSnapshot({
    site: "kemono",
    period: "recent",
    rangeDate: null,
    pageOffset: 0,
    snapshotDate: "2026-03-13",
    posts: [
      {
        rank: 1,
        site: "kemono",
        service: "patreon",
        creatorId: "100",
        postId: "1",
      },
    ],
  });

  const snapshot = await repository.getPopularSnapshot({
    site: "kemono",
    period: "recent",
    rangeDate: null,
    pageOffset: 0,
    now: new Date("2026-03-13T10:15:00.000Z"),
  });

  assert.equal(snapshot.posts.length, 1);
  assert.equal(snapshot.posts[0]?.title, "Warm popular");
  assert.equal(snapshot.snapshotFresh, true);
});

test("local performance repository reuses preview assets and active snapshot fingerprints", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const repository = await createLocalPerformanceRepository({ databaseUrl });

  t.after(async () => {
    await repository.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await repository.upsertPreviewAssetCache({
    site: "kemono",
    sourceVideoUrl: "https://kemono.cr/data/abc/video.mp4",
    sourceFingerprint: "fingerprint-123",
    durationSeconds: 42,
    thumbnailAssetPath: "popular/kemono/fingerprint-123/thumb.webp",
    clipAssetPath: "popular/kemono/fingerprint-123/clip.mp4",
    status: "ready",
    generatedAt: new Date("2026-03-13T09:00:00.000Z"),
    lastSeenAt: new Date("2026-03-13T09:00:00.000Z"),
    error: null,
  });

  const cachedPreview = await repository.getPreviewAssetCache({
    site: "kemono",
    sourceFingerprint: "fingerprint-123",
  });

  assert.equal(cachedPreview?.durationSeconds, 42);
  assert.equal(cachedPreview?.clipAssetPath, "popular/kemono/fingerprint-123/clip.mp4");

  await repository.upsertPostCache({
    site: "kemono",
    service: "patreon",
    creatorId: "100",
    postId: "1",
    title: "Preview ready",
    detailLevel: "metadata",
    sourceKind: "popular",
    previewSourceFingerprint: "fingerprint-123",
    previewStatus: "ready",
    cachedAt: new Date("2026-03-13T10:00:00.000Z"),
    expiresAt: new Date("2026-03-13T11:00:00.000Z"),
  });

  await repository.replacePopularSnapshot({
    site: "kemono",
    period: "recent",
    rangeDate: null,
    pageOffset: 0,
    snapshotDate: "2026-03-13",
    posts: [
      {
        rank: 1,
        site: "kemono",
        service: "patreon",
        creatorId: "100",
        postId: "1",
      },
    ],
  });

  const activeFingerprints = await repository.listActivePreviewSourceFingerprints({
    snapshotDateFrom: "2026-03-10",
  });

  assert.deepEqual(activeFingerprints, [
    {
      site: "kemono",
      sourceFingerprint: "fingerprint-123",
    },
  ]);

  await repository.touchPreviewAssetCache({
    site: "kemono",
    sourceFingerprint: "fingerprint-123",
    lastSeenAt: new Date("2026-03-14T10:00:00.000Z"),
  });

  const touchedPreview = await repository.getPreviewAssetCache({
    site: "kemono",
    sourceFingerprint: "fingerprint-123",
  });
  assert.equal(touchedPreview?.lastSeenAt.toISOString(), "2026-03-14T10:00:00.000Z");

  const stalePreviewEntries = await repository.listPreviewAssetCachesOlderThan({
    cutoff: new Date("2026-03-14T09:00:00.000Z"),
  });
  assert.equal(stalePreviewEntries.length, 0);
});
