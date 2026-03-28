import test from "node:test";
import assert from "node:assert/strict";

import {
  VIDEO_PREVIEW_CACHE_TTL_MS,
  createVideoPreviewCache,
  getDefaultVideoPreviewCache,
  hasWarmVideoPreview,
  readVideoPreviewState,
  resetDefaultVideoPreviewCacheForTests,
  writeVideoPreviewState,
} from "../lib/video-preview-cache.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("video preview cache stores warm state and duration for one hour", () => {
  const storage = createMemoryStorage();
  const cache = createVideoPreviewCache(storage);
  const now = new Date("2026-03-14T10:00:00.000Z");

  writeVideoPreviewState(
    cache,
    "https://cdn.example/video.mp4",
    { warmed: true, durationSeconds: 91 },
    VIDEO_PREVIEW_CACHE_TTL_MS,
    now
  );

  const state = readVideoPreviewState(cache, "https://cdn.example/video.mp4", now);
  assert.equal(state?.warmed, true);
  assert.equal(state?.durationSeconds, 91);
  assert.equal(hasWarmVideoPreview(cache, "https://cdn.example/video.mp4", now), true);
});

test("video preview cache expires stale warm entries", () => {
  const storage = createMemoryStorage();
  const cache = createVideoPreviewCache(storage);
  const now = new Date("2026-03-14T10:00:00.000Z");

  writeVideoPreviewState(
    cache,
    "https://cdn.example/video.mp4",
    { warmed: true, durationSeconds: 91 },
    1000,
    now
  );

  const expiredAt = new Date(now.getTime() + 5000);
  assert.equal(readVideoPreviewState(cache, "https://cdn.example/video.mp4", expiredAt), null);
  assert.equal(hasWarmVideoPreview(cache, "https://cdn.example/video.mp4", expiredAt), false);
});

test("default video preview cache falls back cleanly without browser storage on the server", () => {
  resetDefaultVideoPreviewCacheForTests();
  const cache = getDefaultVideoPreviewCache();
  assert.equal(cache.storage, null);
});

test("default video preview cache uses browser localStorage when available", () => {
  const storage = createMemoryStorage();
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });

  try {
    resetDefaultVideoPreviewCacheForTests();
    const cache = getDefaultVideoPreviewCache();
    assert.equal(cache.storage, storage);
  } finally {
    resetDefaultVideoPreviewCacheForTests();

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }

    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  }
});
