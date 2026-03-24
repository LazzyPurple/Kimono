import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserDataCache,
  fetchJsonWithBrowserCache,
  getDefaultBrowserDataCache,
  readBrowserCacheValue,
  writeBrowserCacheValue,
} from "../lib/browser-data-cache.ts";

function createMemoryStorage() {
  const backing = new Map();

  return {
    get length() {
      return backing.size;
    },
    clear() {
      backing.clear();
    },
    getItem(key) {
      return backing.has(key) ? backing.get(key) : null;
    },
    key(index) {
      return [...backing.keys()][index] ?? null;
    },
    removeItem(key) {
      backing.delete(key);
    },
    setItem(key, value) {
      backing.set(key, String(value));
    },
  };
}

test("browser cache round-trips JSON payloads while the ttl is valid", () => {
  const storage = createMemoryStorage();
  const cache = createBrowserDataCache(storage);
  const now = new Date("2026-03-13T12:00:00.000Z");

  writeBrowserCacheValue(cache, "post:kemono:patreon:1:10", { title: "Warm post" }, 60_000, now);

  assert.deepEqual(
    readBrowserCacheValue(cache, "post:kemono:patreon:1:10", new Date("2026-03-13T12:00:30.000Z")),
    { title: "Warm post" }
  );
});

test("browser cache drops expired payloads and invalid json", () => {
  const storage = createMemoryStorage();
  const cache = createBrowserDataCache(storage);
  const now = new Date("2026-03-13T12:00:00.000Z");

  writeBrowserCacheValue(cache, "search:q=maple", { total: 1 }, 5_000, now);
  storage.setItem("broken", "{oops");

  assert.equal(
    readBrowserCacheValue(cache, "search:q=maple", new Date("2026-03-13T12:00:06.000Z")),
    null
  );
  assert.equal(readBrowserCacheValue(cache, "broken", now), null);
});

test("browser cache can skip storing degraded responses", async () => {
  const storage = createMemoryStorage();
  const cache = createBrowserDataCache(storage);
  let calls = 0;

  const first = await fetchJsonWithBrowserCache({
    key: "search:coomer",
    ttlMs: 60_000,
    cache,
    shouldCache: (value) => value?.source !== "stale-cache",
    loader: async () => {
      calls += 1;
      return { source: "stale-cache", total: 4 };
    },
  });

  const second = await fetchJsonWithBrowserCache({
    key: "search:coomer",
    ttlMs: 60_000,
    cache,
    shouldCache: (value) => value?.source !== "stale-cache",
    loader: async () => {
      calls += 1;
      return { source: "live-refresh", total: 100 };
    },
  });

  assert.equal(first.source, "stale-cache");
  assert.equal(second.source, "live-refresh");
  assert.equal(calls, 2);
});


test("default browser cache does not persist data in localStorage anymore", () => {
  const cache = getDefaultBrowserDataCache();
  assert.equal(cache.storage, null);
});
