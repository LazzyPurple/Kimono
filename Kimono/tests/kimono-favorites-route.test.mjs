import test from "node:test";
import assert from "node:assert/strict";

import { getKimonoFavoritesPayload } from "../lib/kimono-favorites-route.ts";

function makeFavoriteCreator(overrides = {}) {
  return {
    id: "creator-1",
    name: "Maple",
    site: "kemono",
    service: "patreon",
    indexed: "2026-03-19T10:00:00.000Z",
    updated: "2026-03-19T10:00:00.000Z",
    favorited: 42,
    ...overrides,
  };
}

test("kimono favorites payload reports logged out state when no session exists", async () => {
  const payload = await getKimonoFavoritesPayload({
    site: "kemono",
    loadSession: async () => null,
    fetchFavorites: async () => {
      throw new Error("should not fetch without a session");
    },
  });

  assert.deepEqual(payload, {
    loggedIn: false,
    expired: false,
    username: null,
    favorites: [],
  });
});

test("kimono favorites payload reports expired state when upstream fetch fails", async () => {
  const payload = await getKimonoFavoritesPayload({
    site: "coomer",
    loadSession: async () => ({
      id: "session-1",
      site: "coomer",
      cookie: "session=value",
      username: "alice",
      savedAt: new Date("2026-03-19T10:00:00.000Z"),
    }),
    fetchFavorites: async () => {
      throw new Error("upstream unavailable");
    },
    readSnapshot: async () => [],
    listFavoriteChronology: async () => [],
  });

  assert.equal(payload.loggedIn, false);
  assert.equal(payload.expired, true);
  assert.equal(payload.username, "alice");
  assert.deepEqual(payload.favorites, []);
});

test("kimono favorites payload enriches creators with chronology metadata", async () => {
  const payload = await getKimonoFavoritesPayload({
    site: "kemono",
    loadSession: async () => ({
      id: "session-1",
      site: "kemono",
      cookie: "session=value",
      username: "maple",
      savedAt: new Date("2026-03-19T10:00:00.000Z"),
    }),
    fetchFavorites: async () => [makeFavoriteCreator()],
    listFavoriteChronology: async () => [{
      kind: "creator",
      site: "kemono",
      service: "patreon",
      creatorId: "creator-1",
      postId: null,
      favoritedAt: new Date("2026-03-19T11:00:00.000Z"),
    }],
    writeSnapshot: async () => {},
  });

  assert.equal(payload.loggedIn, true);
  assert.equal(payload.expired, false);
  assert.equal(payload.username, "maple");
  assert.equal(payload.favorites.length, 1);
  assert.equal(payload.favorites[0].favoriteAddedAt, "2026-03-19T11:00:00.000Z");
  assert.equal(payload.favorites[0].favoriteSourceIndex, 0);
});


test("kimono favorites payload falls back to a persisted favorite snapshot when upstream fails", async () => {
  const payload = await getKimonoFavoritesPayload({
    site: "coomer",
    loadSession: async () => ({
      id: "session-1",
      site: "coomer",
      cookie: "session=value",
      username: "alice",
      savedAt: new Date("2026-03-19T10:00:00.000Z"),
    }),
    fetchFavorites: async () => {
      throw new Error("upstream unavailable");
    },
    listFavoriteChronology: async () => [],
    readSnapshot: async () => [makeFavoriteCreator({ site: "coomer", service: "onlyfans", id: "creator-9", name: "Saved Maple" })],
    writeSnapshot: async () => {},
  });

  assert.equal(payload.loggedIn, true);
  assert.equal(payload.expired, true);
  assert.equal(payload.favorites.length, 1);
  assert.equal(payload.favorites[0].name, "Saved Maple");
});
