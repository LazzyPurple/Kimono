import test from "node:test";
import assert from "node:assert/strict";

import { createHybridContentService } from "../lib/hybrid-content.ts";

function createPost({ site = "coomer", service = "onlyfans", creatorId = "nyx", id, kind, title = `Post ${id}` }) {
  return {
    site,
    service,
    user: creatorId,
    id,
    title,
    content: kind === "video" ? "video content" : "image content",
    published: "2026-03-24T12:00:00.000Z",
    added: "2026-03-24T12:00:00.000Z",
    edited: "2026-03-24T12:00:00.000Z",
    embed: {},
    file: kind === "video"
      ? { name: `${id}.mp4`, path: `/data/${id}.mp4` }
      : { name: `${id}.jpg`, path: `/data/${id}.jpg` },
    attachments: [],
  };
}

test("hybrid creator filtered search returns a fresh dedicated cache hit before touching upstream", async () => {
  let liveCalls = 0;
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      getCreatorSearchCache: async () => ({
        site: "coomer",
        service: "onlyfans",
        creatorId: "nyxmonroe",
        normalizedQuery: "hi",
        media: "videos",
        page: 1,
        perPage: 2,
        payload: {
          posts: [createPost({ id: "cached-video", kind: "video", title: "Hi there" })],
          total: 1,
          page: 1,
          perPage: 2,
          hasNextPage: false,
          scannedPages: 0,
          truncated: false,
          source: "upstream",
          cache: { hit: false, stale: false, ttlSeconds: 259200 },
        },
        cachedAt: new Date("2026-03-24T12:00:00.000Z"),
        expiresAt: new Date("2026-03-27T12:00:00.000Z"),
      }),
      upsertCreatorSearchCache: async () => undefined,
    },
    fetchCreatorPostsLive: async () => {
      liveCalls += 1;
      return [];
    },
  });

  const result = await service.searchCreatorPosts({
    site: "coomer",
    service: "onlyfans",
    creatorId: "nyxmonroe",
    query: "Hi",
    media: "videos",
    page: 1,
    perPage: 2,
    now: new Date("2026-03-24T13:00:00.000Z"),
  });

  assert.equal(liveCalls, 0);
  assert.equal(result.source, "cache");
  assert.equal(result.cache.hit, true);
  assert.equal(result.posts[0]?.id, "cached-video");
});

test("hybrid creator filtered search scans multiple upstream pages to build a faithful filtered page and caches it", async () => {
  const offsets = [];
  const cacheWrites = [];
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      getCreatorSearchCache: async () => null,
      upsertCreatorSearchCache: async (input) => {
        cacheWrites.push(input);
      },
    },
    fetchCreatorPostsLive: async (_site, _service, _creatorId, offset) => {
      offsets.push(offset);
      if (offset === 0) {
        return Array.from({ length: 50 }, (_, index) => createPost({ id: `image-${index + 1}`, kind: "image" }));
      }

      if (offset === 50) {
        return [
          createPost({ id: "video-51", kind: "video" }),
          createPost({ id: "video-52", kind: "video" }),
          createPost({ id: "image-53", kind: "image" }),
        ];
      }

      return [];
    },
  });

  const result = await service.searchCreatorPosts({
    site: "coomer",
    service: "onlyfans",
    creatorId: "nyxmonroe",
    query: "",
    media: "videos",
    page: 1,
    perPage: 2,
    now: new Date("2026-03-24T13:00:00.000Z"),
  });

  assert.deepEqual(offsets, [0, 50]);
  assert.equal(result.source, "upstream");
  assert.equal(result.scannedPages, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.total, 2);
  assert.equal(result.hasNextPage, false);
  assert.deepEqual(result.posts.map((post) => post.id), ["video-51", "video-52"]);
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0]?.payload?.total, 2);
});

test("hybrid creator filtered search serves stale cached pages when upstream fails", async () => {
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      getCreatorSearchCache: async () => ({
        site: "coomer",
        service: "onlyfans",
        creatorId: "nyxmonroe",
        normalizedQuery: "hi",
        media: "videos",
        page: 1,
        perPage: 2,
        payload: {
          posts: [createPost({ id: "stale-video", kind: "video", title: "Hi there" })],
          total: 1,
          page: 1,
          perPage: 2,
          hasNextPage: false,
          scannedPages: 1,
          truncated: false,
          source: "upstream",
          cache: { hit: false, stale: false, ttlSeconds: 259200 },
        },
        cachedAt: new Date("2026-03-20T12:00:00.000Z"),
        expiresAt: new Date("2026-03-21T12:00:00.000Z"),
      }),
      upsertCreatorSearchCache: async () => undefined,
    },
    fetchCreatorPostsLive: async () => {
      throw new Error("upstream unavailable");
    },
  });

  const result = await service.searchCreatorPosts({
    site: "coomer",
    service: "onlyfans",
    creatorId: "nyxmonroe",
    query: "Hi",
    media: "videos",
    page: 1,
    perPage: 2,
    now: new Date("2026-03-24T13:00:00.000Z"),
  });

  assert.equal(result.source, "stale-cache");
  assert.equal(result.cache.stale, true);
  assert.equal(result.posts[0]?.id, "stale-video");
});
