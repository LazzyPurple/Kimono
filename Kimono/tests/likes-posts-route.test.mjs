import test from "node:test";
import assert from "node:assert/strict";

import { getLikesPostsPayload } from "../lib/likes-posts-route.ts";

function makeFavoritePost(overrides = {}) {
  return {
    id: "post-1",
    user: "creator-1",
    site: "kemono",
    service: "patreon",
    title: "Favorite post",
    content: "Hello",
    published: "2026-03-19T10:00:00.000Z",
    added: "2026-03-19T10:00:00.000Z",
    edited: "2026-03-19T10:00:00.000Z",
    embed: {},
    file: { name: "", path: "" },
    attachments: [],
    ...overrides,
  };
}

test("likes posts payload reports logged out state when no session exists", async () => {
  const payload = await getLikesPostsPayload({
    site: "kemono",
    loadSession: async () => null,
    fetchFavoritePosts: async () => {
      throw new Error("should not fetch without a session");
    },
  });

  assert.deepEqual(payload, {
    loggedIn: false,
    expired: false,
    items: [],
    username: null,
  });
});

test("likes posts payload reports expired state when upstream fetch fails", async () => {
  const payload = await getLikesPostsPayload({
    site: "coomer",
    loadSession: async () => ({
      id: "session-1",
      site: "coomer",
      cookie: "session=value",
      username: "alice",
      savedAt: new Date("2026-03-19T10:00:00.000Z"),
    }),
    fetchFavoritePosts: async () => {
      throw new Error("upstream unavailable");
    },
    readSnapshot: async () => [],
    listFavoriteChronology: async () => [],
    resolveCreatorNames: async () => new Map(),
  });

  assert.equal(payload.loggedIn, false);
  assert.equal(payload.expired, true);
  assert.equal(payload.username, "alice");
  assert.deepEqual(payload.items, []);
});

test("likes posts payload returns enriched favorite posts with chronology and creator names", async () => {
  const payload = await getLikesPostsPayload({
    site: "kemono",
    loadSession: async () => ({
      id: "session-1",
      site: "kemono",
      cookie: "session=value",
      username: "maple",
      savedAt: new Date("2026-03-19T10:00:00.000Z"),
    }),
    fetchFavoritePosts: async () => [makeFavoritePost()],
    hydratePosts: async (posts) => posts.map((post) => ({
      ...post,
      previewThumbnailUrl: "/api/media/preview/popular/kemono/fingerprint/thumb.webp",
    })),
    listFavoriteChronology: async () => [{
      kind: "post",
      site: "kemono",
      service: "patreon",
      creatorId: "creator-1",
      postId: "post-1",
      favoritedAt: new Date("2026-03-19T11:00:00.000Z"),
    }],
    resolveCreatorNames: async () => new Map([["kemono:patreon:creator-1", "Maple"]]),
    writeSnapshot: async () => {},
  });

  assert.equal(payload.loggedIn, true);
  assert.equal(payload.expired, false);
  assert.equal(payload.username, "maple");
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].site, "kemono");
  assert.equal(payload.items[0].creatorName, "Maple");
  assert.equal(payload.items[0].favoriteAddedAt, "2026-03-19T11:00:00.000Z");
  assert.equal(payload.items[0].favoriteSourceIndex, 0);
  assert.equal(payload.items[0].previewThumbnailUrl, "/api/media/preview/popular/kemono/fingerprint/thumb.webp");
});
