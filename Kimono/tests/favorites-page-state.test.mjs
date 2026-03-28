import test from "node:test";
import assert from "node:assert/strict";

import {
  filterFavoriteCreators,
  filterFavoritePosts,
  normalizeFavoritesPageParam,
  sortFavoriteCreators,
  sortFavoritePosts,
} from "../lib/favorites-page-state.ts";

function makeCreator(overrides = {}) {
  return {
    id: "creator-1",
    site: "kemono",
    service: "patreon",
    name: "Maple",
    updated: "2026-03-18T10:00:00.000Z",
    favorited: 10,
    favoriteSourceIndex: 0,
    favoriteAddedAt: null,
    favedSeq: null,
    ...overrides,
  };
}

function makePost(overrides = {}) {
  return {
    id: "post-1",
    user: "creator-1",
    site: "kemono",
    service: "patreon",
    title: "Hello world",
    content: "Preview body",
    published: "2026-03-18T10:00:00.000Z",
    added: "2026-03-18T10:00:00.000Z",
    edited: "2026-03-18T10:00:00.000Z",
    embed: {},
    file: { name: "", path: "" },
    attachments: [],
    creatorName: "Maple",
    favoriteSourceIndex: 0,
    favoriteAddedAt: null,
    favedSeq: null,
    ...overrides,
  };
}

test("normalizeFavoritesPageParam clamps invalid values to page 1", () => {
  assert.equal(normalizeFavoritesPageParam("1"), 1);
  assert.equal(normalizeFavoritesPageParam("0"), 1);
  assert.equal(normalizeFavoritesPageParam("-5"), 1);
  assert.equal(normalizeFavoritesPageParam("NaN"), 1);
  assert.equal(normalizeFavoritesPageParam(undefined), 1);
});

test("sortFavoriteCreators keeps deterministic site fallback for legacy mixed-site favorites", () => {
  const creators = [
    makeCreator({ id: "coomer-1", site: "coomer", service: "onlyfans", favoriteSourceIndex: 0 }),
    makeCreator({ id: "kemono-1", site: "kemono", service: "patreon", favoriteSourceIndex: 1 }),
    makeCreator({ id: "kemono-0", site: "kemono", service: "patreon", favoriteSourceIndex: 0 }),
  ];

  const sorted = sortFavoriteCreators(creators, "favorites");

  assert.deepEqual(
    sorted.map((creator) => creator.id),
    ["kemono-0", "kemono-1", "coomer-1"]
  );
});

test("sortFavoriteCreators prioritizes descending favedSeq over legacy upstream order", () => {
  const creators = [
    makeCreator({
      id: "older-seq",
      site: "kemono",
      favoriteSourceIndex: 0,
      favoriteAddedAt: null,
      favedSeq: 10,
    }),
    makeCreator({
      id: "newer-seq",
      site: "coomer",
      service: "onlyfans",
      favoriteSourceIndex: 10,
      favoriteAddedAt: "2026-03-19T12:00:00.000Z",
      favedSeq: 20,
    }),
  ];

  const sorted = sortFavoriteCreators(creators, "favorites");

  assert.deepEqual(sorted.map((creator) => creator.id), ["newer-seq", "older-seq"]);
});

test("filterFavoritePosts searches title, content, creator name, and service", () => {
  const posts = [
    makePost({
      id: "post-1",
      title: "Velvet update",
      content: "Backstage gallery",
      creatorName: "Star Velvet",
      service: "fansly",
    }),
    makePost({
      id: "post-2",
      title: "Another post",
      content: "Nothing here",
      creatorName: "Maple",
      service: "patreon",
    }),
  ];

  assert.deepEqual(filterFavoritePosts(posts, { query: "velvet", service: "Tous" }).map((post) => post.id), ["post-1"]);
  assert.deepEqual(filterFavoritePosts(posts, { query: "gallery", service: "Tous" }).map((post) => post.id), ["post-1"]);
  assert.deepEqual(filterFavoritePosts(posts, { query: "fansly", service: "Tous" }).map((post) => post.id), ["post-1"]);
  assert.deepEqual(filterFavoritePosts(posts, { query: "maple", service: "Tous" }).map((post) => post.id), ["post-2"]);
});

test("sortFavoritePosts supports faved-date and published sorts", () => {
  const posts = [
    makePost({
      id: "older-seq",
      site: "kemono",
      favoriteSourceIndex: 0,
      favoriteAddedAt: null,
      favedSeq: 12,
      published: "2026-03-18T10:00:00.000Z",
    }),
    makePost({
      id: "newer-seq",
      site: "coomer",
      service: "onlyfans",
      favoriteSourceIndex: 4,
      favoriteAddedAt: "2026-03-19T12:00:00.000Z",
      favedSeq: 30,
      published: "2026-03-17T10:00:00.000Z",
    }),
  ];

  assert.deepEqual(sortFavoritePosts(posts, "favorites").map((post) => post.id), ["newer-seq", "older-seq"]);
  assert.deepEqual(sortFavoritePosts(posts, "published").map((post) => post.id), ["older-seq", "newer-seq"]);
});

test("filterFavoriteCreators keeps creator-name filtering behavior", () => {
  const creators = [
    makeCreator({ id: "creator-1", name: "Maple" }),
    makeCreator({ id: "creator-2", name: "Velvet" }),
  ];

  assert.deepEqual(
    filterFavoriteCreators(creators, { query: "vel", service: "Tous" }).map((creator) => creator.id),
    ["creator-2"]
  );
});
