import test from "node:test";
import assert from "node:assert/strict";

import {
  extractCreatorLikeItems,
  extractPostLikeItems,
  makeCreatorLikeKey,
  makePostLikeKey,
} from "../lib/likes-context-utils.ts";

test("makePostLikeKey keeps creator identity to avoid collisions between posts sharing the same upstream id", () => {
  assert.notEqual(
    makePostLikeKey("coomer", "fansly", "creator-a", "post-1"),
    makePostLikeKey("coomer", "fansly", "creator-b", "post-1")
  );
});

test("extract creator and post like items support structured favorites payloads", () => {
  const creators = extractCreatorLikeItems({
    favorites: [{ id: "creator-1", service: "patreon", favoriteSourceIndex: 0, favoriteAddedAt: null, name: "Maple", site: "kemono" }],
  });
  const posts = extractPostLikeItems({
    items: [{ id: "post-1", service: "fansly", user: "creator-1" }],
  });

  assert.equal(makeCreatorLikeKey("kemono", "patreon", creators[0].id), "kemono-patreon-creator-1");
  assert.equal(posts[0].user, "creator-1");
});
