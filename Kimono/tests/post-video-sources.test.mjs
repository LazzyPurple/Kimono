import test from "node:test";
import assert from "node:assert/strict";

import { hydratePostVideoSources, resolveRequestedPostVideoSource } from "../lib/post-video-sources.ts";

function makePost(overrides = {}) {
  return {
    id: "post-1",
    user: "creator-1",
    service: "fansly",
    site: "coomer",
    title: "Video bundle",
    content: "",
    published: "2026-03-24T10:00:00.000Z",
    added: "2026-03-24T10:00:00.000Z",
    edited: "2026-03-24T10:00:00.000Z",
    embed: {},
    file: { name: "intro.mp4", path: "/abc/intro.mp4" },
    attachments: [
      { name: "bonus.jpg", path: "/abc/bonus.jpg" },
      { name: "alt-video.mp4", path: "/abc/alt-video.mp4" },
    ],
    ...overrides,
  };
}

test("hydratePostVideoSources maps each post video to upstream and local stream metadata", async () => {
  const post = makePost();
  const seenFingerprints = [];
  const videoSources = await hydratePostVideoSources(post, {
    getMediaSourceCache: async ({ sourceFingerprint }) => {
      seenFingerprints.push(sourceFingerprint);
      if (seenFingerprints.length === 1) {
        return {
          site: "coomer",
          sourceVideoUrl: "https://coomer.st/data/abc/intro.mp4",
          sourceFingerprint,
          localVideoPath: "coomer/source-ready/source.mp4",
          downloadStatus: "source-ready",
          downloadedAt: new Date("2026-03-24T10:00:00.000Z"),
          lastSeenAt: new Date("2026-03-24T10:00:00.000Z"),
          retentionUntil: new Date("2026-03-25T10:00:00.000Z"),
          fileSizeBytes: 1024,
          mimeType: "video/mp4",
          downloadError: null,
          downloadAttempts: 1,
          lastObservedContext: "playback",
          priorityClass: "playback",
          retryAfter: null,
          firstSeenAt: new Date("2026-03-24T09:00:00.000Z"),
        };
      }

      return {
        site: "coomer",
        sourceVideoUrl: "https://coomer.st/data/abc/alt-video.mp4",
        sourceFingerprint,
        localVideoPath: null,
        downloadStatus: "source-downloading",
        downloadedAt: null,
        lastSeenAt: new Date("2026-03-24T10:00:00.000Z"),
        retentionUntil: null,
        fileSizeBytes: null,
        mimeType: "video/mp4",
        downloadError: null,
        downloadAttempts: 1,
        lastObservedContext: "playback",
        priorityClass: "playback",
        retryAfter: null,
        firstSeenAt: new Date("2026-03-24T09:00:00.000Z"),
      };
    },
  });

  assert.equal(videoSources.length, 2);
  assert.equal(videoSources[0]?.path, "/abc/intro.mp4");
  assert.equal(videoSources[0]?.upstreamUrl, "https://coomer.st/data/abc/intro.mp4");
  assert.equal(videoSources[0]?.localSourceAvailable, true);
  assert.equal(videoSources[0]?.sourceCacheStatus, "source-ready");
  assert.equal(videoSources[0]?.localStreamUrl?.startsWith("/api/media/coomer/"), true);
  assert.equal(videoSources[1]?.path, "/abc/alt-video.mp4");
  assert.equal(videoSources[1]?.localSourceAvailable, false);
  assert.equal(videoSources[1]?.sourceCacheStatus, "source-downloading");
  assert.equal(videoSources[1]?.localStreamUrl, null);
});

test("resolveRequestedPostVideoSource only matches exact video paths from the post", async () => {
  const post = makePost();
  const match = await resolveRequestedPostVideoSource(post, "/abc/alt-video.mp4");
  const missing = await resolveRequestedPostVideoSource(post, "/abc/not-present.mp4");
  const nonVideo = await resolveRequestedPostVideoSource(post, "/abc/bonus.jpg");

  assert.equal(match?.path, "/abc/alt-video.mp4");
  assert.equal(match?.upstreamUrl, "https://coomer.st/data/abc/alt-video.mp4");
  assert.equal(missing, null);
  assert.equal(nonVideo, null);
});
