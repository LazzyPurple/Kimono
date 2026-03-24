import test from "node:test";
import assert from "node:assert/strict";

import { getRecentPostsPayload } from "../lib/recent-posts-route.ts";

function makePost(overrides = {}) {
  return {
    id: "post-1",
    user: "creator-1",
    service: "patreon",
    site: "kemono",
    title: "Recent post",
    content: "",
    published: "2026-03-19T10:00:00.000Z",
    added: "2026-03-19T10:00:00.000Z",
    edited: "2026-03-19T10:00:00.000Z",
    embed: {},
    file: { name: "video.mp4", path: "/abc/video.mp4" },
    attachments: [],
    ...overrides,
  };
}

test("recent posts payload hydrates the shared media state before returning posts", async () => {
  const contexts = [];
  const payload = await getRecentPostsPayload({
    offset: 50,
    fetchPosts: async (offset) => {
      assert.equal(offset, 50);
      return [makePost()];
    },
    hydratePosts: async (posts, options) => {
      contexts.push(options?.context ?? null);
      return posts.map((post) => ({
        ...post,
        previewThumbnailUrl: "/api/preview-assets/popular/kemono/fingerprint/thumb.webp",
        mediaArtifactStatus: "ready",
      }));
    },
  });

  assert.deepEqual(contexts, ["recent-posts"]);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.previewThumbnailUrl, "/api/preview-assets/popular/kemono/fingerprint/thumb.webp");
  assert.equal(payload[0]?.mediaArtifactStatus, "ready");
});
