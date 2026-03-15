import test from "node:test";
import assert from "node:assert/strict";

import {
  BROWSER_POST_CACHE_TTL_MS,
  CREATOR_SNAPSHOT_TTL_MS,
  POPULAR_SNAPSHOT_TTL_MS,
  buildCreatorCacheKey,
  buildPostCacheKey,
  buildSearchCacheKey,
  isSnapshotFresh,
  isTimedCacheFresh,
  normalizeCreatorName,
} from "../lib/perf-cache.ts";

test("normalizeCreatorName trims, lowercases and collapses spaces", () => {
  assert.equal(normalizeCreatorName("  Belle   Delphine  "), "belle delphine");
});

test("buildCreatorCacheKey uses site, service and creator id", () => {
  assert.equal(
    buildCreatorCacheKey({
      site: "kemono",
      service: "patreon",
      creatorId: "42",
    }),
    "kemono:patreon:42"
  );
});

test("buildPostCacheKey uses site, service, creator id and post id", () => {
  assert.equal(
    buildPostCacheKey({
      site: "coomer",
      service: "onlyfans",
      creatorId: "abc",
      postId: "999",
    }),
    "coomer:onlyfans:abc:999"
  );
});

test("buildSearchCacheKey is stable for identical search params", () => {
  const key = buildSearchCacheKey({
    q: "maple",
    filter: "kemono",
    sort: "date",
    service: "patreon",
    page: 2,
    perPage: 50,
  });

  assert.equal(key, "search:q=maple|filter=kemono|sort=date|service=patreon|page=2|perPage=50");
});

test("isSnapshotFresh uses the configured TTL windows", () => {
  const now = new Date("2026-03-13T12:00:00.000Z");

  assert.equal(
    isSnapshotFresh(new Date(now.getTime() - CREATOR_SNAPSHOT_TTL_MS + 1), CREATOR_SNAPSHOT_TTL_MS, now),
    true
  );
  assert.equal(
    isSnapshotFresh(new Date(now.getTime() - POPULAR_SNAPSHOT_TTL_MS - 1), POPULAR_SNAPSHOT_TTL_MS, now),
    false
  );
});

test("isTimedCacheFresh expires short lived browser caches", () => {
  const now = new Date("2026-03-13T12:00:00.000Z");

  assert.equal(
    isTimedCacheFresh(new Date(now.getTime() - BROWSER_POST_CACHE_TTL_MS + 1000), BROWSER_POST_CACHE_TTL_MS, now),
    true
  );
  assert.equal(
    isTimedCacheFresh(new Date(now.getTime() - BROWSER_POST_CACHE_TTL_MS - 1000), BROWSER_POST_CACHE_TTL_MS, now),
    false
  );
});
