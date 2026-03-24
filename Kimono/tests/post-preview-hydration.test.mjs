import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCachedPreviewFields,
  hydratePostsWithCachedPreviewAssets,
  hydratePostsWithMediaPlatform,
} from "../lib/post-preview-hydration.ts";

function makePost(overrides = {}) {
  return {
    id: "post-1",
    user: "creator-1",
    service: "patreon",
    site: "kemono",
    title: "Sample post",
    content: "",
    published: "2026-03-10T00:00:00.000Z",
    added: "2026-03-10T00:00:00.000Z",
    edited: "2026-03-10T00:00:00.000Z",
    embed: {},
    file: { name: "video.mp4", path: "/abc/video.mp4" },
    attachments: [],
    ...overrides,
  };
}

test("applyCachedPreviewFields injects cached preview assets onto a raw post", () => {
  const hydrated = applyCachedPreviewFields(
    makePost(),
    {
      longestVideoUrl: "https://kemono.cr/data/abc/video.mp4",
      longestVideoDurationSeconds: 95,
      previewThumbnailAssetPath: "popular/kemono/fingerprint-1/thumb.webp",
      previewClipAssetPath: "popular/kemono/fingerprint-1/clip.mp4",
      previewStatus: "ready",
      previewGeneratedAt: new Date("2026-03-14T10:00:00.000Z"),
      previewError: null,
      previewSourceFingerprint: "fingerprint-1",
    }
  );

  assert.equal(hydrated.longestVideoUrl, "https://kemono.cr/data/abc/video.mp4");
  assert.equal(hydrated.longestVideoDurationSeconds, 95);
  assert.equal(
    hydrated.previewThumbnailUrl,
    "/api/preview-assets/popular/kemono/fingerprint-1/thumb.webp"
  );
  assert.equal(
    hydrated.previewClipUrl,
    "/api/preview-assets/popular/kemono/fingerprint-1/clip.mp4"
  );
  assert.equal(hydrated.previewStatus, "ready");
  assert.equal(hydrated.previewGeneratedAt, "2026-03-14T10:00:00.000Z");
  assert.equal(hydrated.previewSourceFingerprint, "fingerprint-1");
});

test("applyCachedPreviewFields keeps richer preview values already present on the post", () => {
  const hydrated = applyCachedPreviewFields(
    makePost({
      previewThumbnailUrl: "/api/preview-assets/custom/thumb.webp",
      previewClipUrl: "/api/preview-assets/custom/clip.mp4",
      longestVideoDurationSeconds: 41,
      previewStatus: "generated-inline",
      previewSourceFingerprint: "custom-inline",
    }),
    {
      longestVideoUrl: "https://kemono.cr/data/abc/video.mp4",
      longestVideoDurationSeconds: 95,
      previewThumbnailAssetPath: "popular/kemono/fingerprint-1/thumb.webp",
      previewClipAssetPath: "popular/kemono/fingerprint-1/clip.mp4",
      previewStatus: "ready",
      previewGeneratedAt: new Date("2026-03-14T10:00:00.000Z"),
      previewError: null,
      previewSourceFingerprint: "fingerprint-1",
    }
  );

  assert.equal(hydrated.previewThumbnailUrl, "/api/preview-assets/custom/thumb.webp");
  assert.equal(hydrated.previewClipUrl, "/api/preview-assets/custom/clip.mp4");
  assert.equal(hydrated.longestVideoDurationSeconds, 41);
  assert.equal(hydrated.previewStatus, "generated-inline");
  assert.equal(hydrated.previewSourceFingerprint, "custom-inline");
});

test("hydratePostsWithCachedPreviewAssets enriches each post with matching cached preview metadata", async () => {
  const calls = [];
  const hydrated = await hydratePostsWithCachedPreviewAssets(
    [
      makePost(),
      makePost({ id: "post-2", user: "creator-2" }),
    ],
    {
      repository: {
        getPostCache: async ({ site, service, creatorId, postId }) => {
          calls.push(`${site}:${service}:${creatorId}:${postId}`);
          if (postId !== "post-1") {
            return null;
          }

          return {
            longestVideoUrl: "https://kemono.cr/data/abc/video.mp4",
            longestVideoDurationSeconds: 95,
            previewThumbnailAssetPath: "popular/kemono/fingerprint-1/thumb.webp",
            previewClipAssetPath: "popular/kemono/fingerprint-1/clip.mp4",
            previewStatus: "ready",
            previewGeneratedAt: new Date("2026-03-14T10:00:00.000Z"),
            previewError: null,
            previewSourceFingerprint: "fingerprint-1",
          };
        },
      },
    }
  );

  assert.deepEqual(calls, [
    "kemono:patreon:creator-1:post-1",
    "kemono:patreon:creator-2:post-2",
  ]);
  assert.equal(
    hydrated[0]?.previewThumbnailUrl,
    "/api/preview-assets/popular/kemono/fingerprint-1/thumb.webp"
  );
  assert.equal(hydrated[1]?.previewThumbnailUrl, undefined);
});

test("hydratePostsWithMediaPlatform observes unseen media sources and schedules shared preview generation", async () => {
  const previewWrites = [];
  const scheduled = [];

  const hydrated = await hydratePostsWithMediaPlatform(
    [makePost()],
    {
      context: "recent-posts",
      repository: {
        getPostCache: async () => null,
        getPreviewAssetCache: async () => null,
        upsertPreviewAssetCache: async (input) => {
          previewWrites.push(input);
        },
        touchPreviewAssetCache: async () => {},
      },
      schedulePreviewGeneration: async (input) => {
        scheduled.push(input);
      },
      probeMediaSource: async () => null,
    }
  );

  assert.equal(previewWrites.length, 1);
  assert.equal(previewWrites[0]?.probeStatus, "pending");
  assert.equal(previewWrites[0]?.artifactStatus, "pending");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.context, "recent-posts");
  assert.equal(scheduled[0]?.post.id, "post-1");
  assert.equal(hydrated[0]?.previewSourceFingerprint?.length, 24);
  assert.equal(hydrated[0]?.mediaArtifactStatus, "pending");
  assert.equal(hydrated[0]?.isMediaHot, true);
});

test("hydratePostsWithMediaPlatform can propagate a premium priority class to the shared preview scheduler", async () => {
  const scheduled = [];

  await hydratePostsWithMediaPlatform(
    [makePost({
      site: "coomer",
      service: "fansly",
      file: { name: "video.mp4", path: "/coomer/video.mp4" },
    })],
    {
      context: "favorites-posts",
      repository: {
        getPostCache: async () => null,
        getPreviewAssetCache: async () => null,
        upsertPreviewAssetCache: async () => undefined,
        touchPreviewAssetCache: async () => undefined,
      },
      schedulePreviewGeneration: async (input) => {
        scheduled.push(input);
      },
      probeMediaSource: async () => null,
      resolvePriorityClass: () => "liked",
    }
  );

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.priorityClass, "liked");
});