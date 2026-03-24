import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createLocalPerformanceRepository } from "../lib/perf-repository.ts";

function createTempDatabaseCopy() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-snapshot-"));
  const dbPath = path.join(tempDir, "dev.db");
  fs.copyFileSync(path.join(process.cwd(), "prisma", "dev.db"), dbPath);

  return {
    tempDir,
    databaseUrl: `file:${dbPath.replace(/\\/g, "/")}`,
  };
}

function read(filePath) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

test("creator profile upserts keep the richer favorited count when a later refresh omits it", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const repository = await createLocalPerformanceRepository({ databaseUrl });

  t.after(async () => {
    await repository.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await repository.upsertCreatorProfile({
    site: "coomer",
    service: "onlyfans",
    creatorId: "belle",
    name: "Belle Delphine",
    favorited: 83455,
    syncedAt: new Date("2026-03-20T10:00:00.000Z"),
  });

  await repository.upsertCreatorProfile({
    site: "coomer",
    service: "onlyfans",
    creatorId: "belle",
    name: "Belle Delphine",
    favorited: null,
    syncedAt: new Date("2026-03-20T11:00:00.000Z"),
  });

  const profile = await repository.getCreatorProfile({
    site: "coomer",
    service: "onlyfans",
    creatorId: "belle",
  });

  assert.equal(profile?.favorited, 83455);
});

test("favorites payloads expose reliability metadata for favorite dates and snapshot freshness", () => {
  const creatorRoute = read("lib/kimono-favorites-route.ts");
  const postsRoute = read("lib/likes-posts-route.ts");

  for (const source of [creatorRoute, postsRoute]) {
    assert.match(source, /favoriteDateKnown/);
    assert.match(source, /favoriteOrderSource/);
    assert.match(source, /snapshotUpdatedAt/);
    assert.match(source, /stale/);
  }
});

test("creator page promotes media filters and in-page search to the dedicated filtered search endpoint", () => {
  const source = read("app/(protected)/creator/[site]/[service]/[id]/page.tsx");

  assert.match(source, /\/api\/creator-posts\/search/);
  assert.doesNotMatch(source, /scope=snapshot/);
  assert.doesNotMatch(source, /local snapshot/);
});

test("discover compute can read favorite snapshots before hitting upstream account favorites", () => {
  const source = read("app/api/discover/compute/route.ts");

  assert.match(source, /getFavoriteSnapshot/);
});


test("discover compute is snapshot-only and no longer falls back to live account favorites", () => {
  const source = read("app/api/discover/compute/route.ts");

  assert.doesNotMatch(source, /getKimonoSessions/);
  assert.doesNotMatch(source, /account\/favorites?type=artist/);
  assert.match(source, /source: "snapshot-only"/);
});

test("health diagnostics are exposed through both API and page routes", () => {
  const apiRoute = read("app/api/health/route.ts");
  const page = read("app/health/page.tsx");

  assert.match(apiRoute, /getServerHealthPayload/);
  assert.match(page, /Server health/);
  assert.match(page, /\/api\/health/);
});
