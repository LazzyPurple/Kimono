import test from "node:test";
import assert from "node:assert/strict";

import { createMediaPlatform } from "../lib/media-platform.ts";

function makeVideoPost(overrides = {}) {
  return {
    id: "post-1",
    user: "creator-1",
    service: "patreon",
    site: "kemono",
    title: "Sample video",
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

test("media platform observes an unseen source and records pending media metadata", async () => {
  const writes = [];
  const scheduled = [];
  const platform = createMediaPlatform({
    repository: {
      getPreviewAssetCache: async () => null,
      upsertPreviewAssetCache: async (input) => {
        writes.push(input);
      },
      touchPreviewAssetCache: async () => {},
    },
    scheduleGeneration: async (input) => {
      scheduled.push(input);
    },
  });

  const [hydrated] = await platform.observeAndHydratePosts([makeVideoPost()], {
    context: "home",
    now: new Date("2026-03-19T12:00:00.000Z"),
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].mediaKind, "video");
  assert.equal(writes[0].probeStatus, "pending");
  assert.equal(writes[0].artifactStatus, "pending");
  assert.equal(writes[0].nativeThumbnailUrl, null);
  assert.equal(scheduled.length, 1);
  assert.equal(hydrated.previewSourceFingerprint?.length, 24);
  assert.equal(hydrated.mediaKind, "video");
  assert.equal(hydrated.mediaProbeStatus, "pending");
  assert.equal(hydrated.mediaArtifactStatus, "pending");
  assert.equal(hydrated.isMediaHot, true);
});

test("media platform reuses a known source and hydrates the post with cached artifacts", async () => {
  const touched = [];
  const platform = createMediaPlatform({
    repository: {
      getPreviewAssetCache: async () => ({
        site: "kemono",
        sourceVideoUrl: "https://kemono.cr/data/abc/video.mp4",
        sourceFingerprint: "fingerprint-123456789012",
        durationSeconds: 42,
        thumbnailAssetPath: "popular/kemono/fingerprint-123456789012/thumb.webp",
        clipAssetPath: "popular/kemono/fingerprint-123456789012/clip.mp4",
        status: "ready",
        generatedAt: new Date("2026-03-19T09:00:00.000Z"),
        lastSeenAt: new Date("2026-03-19T09:00:00.000Z"),
        error: null,
        mediaKind: "video",
        mimeType: "video/mp4",
        width: 1280,
        height: 720,
        nativeThumbnailUrl: null,
        probeStatus: "probed",
        artifactStatus: "ready",
        firstSeenAt: new Date("2026-03-18T09:00:00.000Z"),
        hotUntil: new Date("2026-03-22T09:00:00.000Z"),
        retryAfter: null,
        generationAttempts: 1,
        lastError: null,
        lastObservedContext: "popular",
      }),
      upsertPreviewAssetCache: async () => {
        throw new Error("should not rewrite a known media source");
      },
      touchPreviewAssetCache: async (input) => {
        touched.push(input);
      },
    },
    scheduleGeneration: async () => {
      throw new Error("should not reschedule a ready media source");
    },
  });

  const [hydrated] = await platform.observeAndHydratePosts([makeVideoPost()], {
    context: "home",
    now: new Date("2026-03-19T12:00:00.000Z"),
  });

  assert.equal(touched.length, 1);
  assert.equal(hydrated.previewThumbnailUrl, "/api/media/preview/popular/kemono/fingerprint-123456789012/thumb.webp");
  assert.equal(hydrated.previewClipUrl, "/api/media/preview/popular/kemono/fingerprint-123456789012/clip.mp4");
  assert.equal(hydrated.longestVideoDurationSeconds, 42);
  assert.equal(hydrated.mediaKind, "video");
  assert.equal(hydrated.mediaProbeStatus, "probed");
  assert.equal(hydrated.mediaArtifactStatus, "ready");
  assert.equal(hydrated.isMediaHot, true);
});

test("media platform stores lightweight probe metadata before scheduling generation", async () => {
  const writes = [];
  const platform = createMediaPlatform({
    repository: {
      getPreviewAssetCache: async () => null,
      upsertPreviewAssetCache: async (input) => {
        writes.push(input);
      },
      touchPreviewAssetCache: async () => {},
    },
    probeMediaSource: async () => ({
      durationSeconds: 37,
      width: 1920,
      height: 1080,
      mimeType: "video/mp4",
    }),
    scheduleGeneration: async () => {},
  });

  const [hydrated] = await platform.observeAndHydratePosts([makeVideoPost()], {
    context: "home",
    now: new Date("2026-03-19T12:00:00.000Z"),
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.durationSeconds, 37);
  assert.equal(writes[0]?.width, 1920);
  assert.equal(writes[0]?.height, 1080);
  assert.equal(writes[0]?.mimeType, "video/mp4");
  assert.equal(writes[0]?.probeStatus, "probed");
  assert.equal(hydrated.longestVideoDurationSeconds, 37);
  assert.equal(hydrated.mediaProbeStatus, "probed");
});
test("media platform hydrates posts with local source cache state when a local source already exists", async () => {
  const [hydrated] = await createMediaPlatform({
    repository: {
      getPreviewAssetCache: async () => null,
      upsertPreviewAssetCache: async () => undefined,
      touchPreviewAssetCache: async () => undefined,
      getMediaSourceCache: async () => ({
        site: "coomer",
        sourceVideoUrl: "https://n2.coomer.st/data/abc/video.mp4",
        sourceFingerprint: "source-fingerprint-123",
        localVideoPath: "coomer/source-fingerprint-123/source.mp4",
        downloadStatus: "source-ready",
        downloadedAt: new Date("2026-03-20T09:00:00.000Z"),
        lastSeenAt: new Date("2026-03-20T09:00:00.000Z"),
        retentionUntil: new Date("2026-03-25T09:00:00.000Z"),
        fileSizeBytes: 1024,
        mimeType: "video/mp4",
        downloadError: null,
        downloadAttempts: 1,
        lastObservedContext: "popular",
        priorityClass: "popular",
        retryAfter: null,
        firstSeenAt: new Date("2026-03-20T08:00:00.000Z"),
      }),
      touchMediaSourceCache: async () => undefined,
    },
    scheduleGeneration: async () => {},
  }).observeAndHydratePosts([makeVideoPost({ site: "coomer", service: "fansly" })], {
    context: "favorites-posts",
    now: new Date("2026-03-22T12:00:00.000Z"),
  });

  assert.equal(hydrated.localSourceAvailable, true);
  assert.equal(hydrated.sourceCacheStatus, "source-ready");
  assert.equal(hydrated.sourceRetentionUntil, "2026-03-25T09:00:00.000Z");
  assert.equal(hydrated.priorityClass, "popular");
});