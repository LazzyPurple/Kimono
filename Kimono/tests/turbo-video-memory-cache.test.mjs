import test from "node:test";
import assert from "node:assert/strict";

import {
  TURBO_VIDEO_MEMORY_TTL_MS,
  createTurboVideoMemoryCache,
  readTurboVideoChunk,
  writeTurboVideoChunk,
} from "../lib/turbo-video-memory-cache.ts";

test("turbo video memory cache reuses the first chunk within the ttl", () => {
  const cache = createTurboVideoMemoryCache();
  const buffer = new Uint8Array([1, 2, 3, 4]).buffer;

  writeTurboVideoChunk(cache, "https://cdn.example/video.mp4", buffer, 2048, TURBO_VIDEO_MEMORY_TTL_MS, Date.now());

  const entry = readTurboVideoChunk(cache, "https://cdn.example/video.mp4", Date.now());
  assert.equal(entry?.totalSize, 2048);
  assert.equal(entry?.buffer.byteLength, 4);
});

test("turbo video memory cache expires old chunks", () => {
  const cache = createTurboVideoMemoryCache();
  const now = Date.now();

  writeTurboVideoChunk(cache, "https://cdn.example/video.mp4", new Uint8Array([1]).buffer, 1024, 1000, now);

  assert.equal(readTurboVideoChunk(cache, "https://cdn.example/video.mp4", now + 5000), null);
});
