import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createLocalPerformanceRepository } from "../lib/perf-repository.ts";

function createTempDatabaseCopy() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-creator-search-"));
  const dbPath = path.join(tempDir, "dev.db");
  fs.writeFileSync(dbPath, "", "utf8");

  return {
    tempDir,
    databaseUrl: `file:${dbPath.replace(/\\/g, "/")}`,
  };
}

test("local performance repository persists creator search cache pages for filtered creator queries", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const repository = await createLocalPerformanceRepository({ databaseUrl });

  t.after(async () => {
    await repository.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await repository.upsertCreatorSearchCache({
    site: "coomer",
    service: "onlyfans",
    creatorId: "nyxmonroe",
    normalizedQuery: "hi",
    media: "videos",
    page: 1,
    perPage: 50,
    payload: {
      posts: [{ id: "post-1", title: "Hi there" }],
      total: 1,
      page: 1,
      perPage: 50,
      hasNextPage: false,
      scannedPages: 2,
      truncated: false,
      source: "upstream",
      cache: {
        hit: false,
        stale: false,
        ttlSeconds: 259200,
      },
    },
    cachedAt: new Date("2026-03-24T12:00:00.000Z"),
    expiresAt: new Date("2026-03-27T12:00:00.000Z"),
  });

  const cached = await repository.getCreatorSearchCache({
    site: "coomer",
    service: "onlyfans",
    creatorId: "nyxmonroe",
    normalizedQuery: "hi",
    media: "videos",
    page: 1,
    perPage: 50,
  });

  assert.equal(cached?.payload?.posts?.length, 1);
  assert.equal(cached?.payload?.posts?.[0]?.title, "Hi there");
  assert.equal(cached?.payload?.scannedPages, 2);
  assert.equal(cached?.expiresAt.toISOString(), "2026-03-27T12:00:00.000Z");
});
