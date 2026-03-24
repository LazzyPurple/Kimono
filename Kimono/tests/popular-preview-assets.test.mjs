import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  createPopularPreviewAssetService,
  createPreviewSourceFingerprint,
  getPreviewAssetRelativePaths,
  normalizePreviewSourceUrl,
} from "../lib/popular-preview-assets.ts";

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

test("normalizePreviewSourceUrl removes hashes and sorts the query string", () => {
  const normalized = normalizePreviewSourceUrl(
    "https://kemono.cr/data/abc/video.mp4?b=2&a=1#fragment"
  );

  assert.equal(
    normalized,
    "https://kemono.cr/data/abc/video.mp4?a=1&b=2"
  );
});

test("preview source fingerprints and asset paths are stable", () => {
  const fingerprint = createPreviewSourceFingerprint(
    "kemono",
    "https://kemono.cr/data/abc/video.mp4"
  );

  assert.equal(fingerprint.length, 24);
  assert.deepEqual(getPreviewAssetRelativePaths("kemono", fingerprint), {
    thumbnailAssetPath: `popular/kemono/${fingerprint}/thumb.webp`,
    clipAssetPath: `popular/kemono/${fingerprint}/clip.mp4`,
  });
});

test("popular preview asset service reuses an existing asset for the same source video", async () => {
  const now = new Date("2026-03-14T12:00:00.000Z");
  const sourceVideoUrl = "https://kemono.cr/data/abc/video.mp4";
  const fingerprint = createPreviewSourceFingerprint("kemono", sourceVideoUrl);
  const paths = getPreviewAssetRelativePaths("kemono", fingerprint);
  const touched = [];

  const service = createPopularPreviewAssetService({
    repository: {
      getPreviewAssetCache: async () => ({
        site: "kemono",
        sourceVideoUrl,
        sourceFingerprint: fingerprint,
        durationSeconds: 95,
        thumbnailAssetPath: paths.thumbnailAssetPath,
        clipAssetPath: paths.clipAssetPath,
        status: "ready",
        generatedAt: new Date("2026-03-13T10:00:00.000Z"),
        lastSeenAt: new Date("2026-03-13T10:00:00.000Z"),
        error: null,
      }),
      upsertPreviewAssetCache: async () => {
        throw new Error("should not regenerate an existing asset");
      },
      touchPreviewAssetCache: async (input) => {
        touched.push(input);
      },
    },
    fileExists: async () => true,
    analyzeVideoSource: async () => {
      throw new Error("analysis should not run when the cached asset is still valid");
    },
    generatePreviewAssets: async () => {
      throw new Error("generation should not run when the cached asset is still valid");
    },
  });

  const result = await service.preparePreviewForPost({
    site: "kemono",
    post: makePost(),
    now,
  });

  assert.equal(result.longestVideoDurationSeconds, 95);
  assert.equal(result.previewThumbnailAssetPath, paths.thumbnailAssetPath);
  assert.equal(result.previewClipAssetPath, paths.clipAssetPath);
  assert.equal(result.previewStatus, "ready");
  assert.equal(result.previewOutcome, "reused");
  assert.equal(touched.length, 1);
  assert.equal(touched[0].sourceFingerprint, fingerprint);
});

test("popular preview asset service generates missing assets and records them in the cache", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-preview-assets-"));
  const now = new Date("2026-03-14T12:00:00.000Z");
  const writes = [];

  try {
    const service = createPopularPreviewAssetService({
      repository: {
        getPreviewAssetCache: async () => null,
        upsertPreviewAssetCache: async (input) => {
          writes.push(input);
        },
        touchPreviewAssetCache: async () => {},
      },
      previewAssetDir: tempDir,
      analyzeVideoSource: async () => ({ durationSeconds: 63 }),
      generatePreviewAssets: async ({ paths }) => ({
        thumbnailAssetPath: paths.thumbnailAssetPath,
        clipAssetPath: paths.clipAssetPath,
      }),
      fileExists: async () => false,
    });

    const result = await service.preparePreviewForPost({
      site: "kemono",
      post: makePost(),
      now,
    });

    assert.equal(result.longestVideoDurationSeconds, 63);
    assert.equal(result.previewStatus, "ready");
    assert.equal(result.previewOutcome, "generated");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, "ready");
    assert.equal(writes[0].durationSeconds, 63);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("popular preview asset service persists lightweight probe metadata when generating assets", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-preview-assets-probe-"));
  const now = new Date("2026-03-14T12:00:00.000Z");
  const writes = [];

  try {
    const service = createPopularPreviewAssetService({
      repository: {
        getPreviewAssetCache: async () => null,
        upsertPreviewAssetCache: async (input) => {
          writes.push(input);
        },
        touchPreviewAssetCache: async () => {},
      },
      previewAssetDir: tempDir,
      analyzeVideoSource: async () => ({
        durationSeconds: 63,
        width: 1920,
        height: 1080,
        mimeType: "video/mp4",
      }),
      generatePreviewAssets: async ({ paths }) => ({
        thumbnailAssetPath: paths.thumbnailAssetPath,
        clipAssetPath: paths.clipAssetPath,
      }),
      fileExists: async () => false,
    });

    await service.preparePreviewForPost({
      site: "kemono",
      post: makePost(),
      now,
    });

    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.durationSeconds, 63);
    assert.equal(writes[0]?.mimeType, "video/mp4");
    assert.equal(writes[0]?.width, 1920);
    assert.equal(writes[0]?.height, 1080);
    assert.equal(writes[0]?.probeStatus, "probed");
    assert.equal(writes[0]?.artifactStatus, "ready");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
test("coomer thumbnail-first generation stores a reusable thumbnail without waiting for a clip", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-preview-thumb-first-"));
  const now = new Date("2026-03-14T12:00:00.000Z");
  const writes = [];
  const generateCalls = [];

  try {
    const service = createPopularPreviewAssetService({
      repository: {
        getPreviewAssetCache: async () => null,
        upsertPreviewAssetCache: async (input) => {
          writes.push(input);
        },
        touchPreviewAssetCache: async () => {},
      },
      previewAssetDir: tempDir,
      analyzeVideoSource: async () => ({ durationSeconds: 41 }),
      generatePreviewAssets: async (input) => {
        generateCalls.push(input);
        return {
          thumbnailAssetPath: input.generateThumbnail ? input.paths.thumbnailAssetPath : null,
          clipAssetPath: input.generateClip ? input.paths.clipAssetPath : null,
        };
      },
      fileExists: async () => false,
    });

    const result = await service.preparePreviewForPost({
      site: "coomer",
      post: makePost({
        site: "coomer",
        service: "onlyfans",
        file: { name: "video.mp4", path: "/coomer/video.mp4" },
      }),
      now,
      generationStrategy: "thumbnail-first",
    });

    assert.equal(generateCalls.length, 1);
    assert.equal(generateCalls[0].generateThumbnail, true);
    assert.equal(generateCalls[0].generateClip, false);
    assert.equal(result.previewThumbnailAssetPath?.endsWith("/thumb.webp"), true);
    assert.equal(result.previewClipAssetPath, null);
    assert.equal(result.previewStatus, "thumbnail-ready");
    assert.equal(result.previewOutcome, "generated");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, "thumbnail-ready");
    assert.equal(writes[0].clipAssetPath, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});



test("popular preview asset service skips regeneration while a preview retry backoff is still active", async () => {
  const now = new Date("2026-03-14T12:00:00.000Z");
  let generateCalled = false;

  const service = createPopularPreviewAssetService({
    repository: {
      getPreviewAssetCache: async () => ({
        site: "coomer",
        sourceVideoUrl: "https://coomer.st/data/abc/video.mp4",
        sourceFingerprint: "retry-fingerprint",
        durationSeconds: 42,
        thumbnailAssetPath: null,
        clipAssetPath: null,
        status: "skipped-no-ffmpeg",
        generatedAt: new Date("2026-03-14T11:00:00.000Z"),
        lastSeenAt: new Date("2026-03-14T11:00:00.000Z"),
        error: "FFmpeg unavailable",
        retryAfter: new Date("2026-03-14T18:00:00.000Z"),
        mediaKind: "video",
        mimeType: "video/mp4",
        width: null,
        height: null,
        nativeThumbnailUrl: null,
        probeStatus: "probed",
        artifactStatus: "missing",
        firstSeenAt: new Date("2026-03-14T10:00:00.000Z"),
        hotUntil: null,
        generationAttempts: 1,
        lastError: "FFmpeg unavailable",
        lastObservedContext: "popular",
      }),
      upsertPreviewAssetCache: async () => {
        throw new Error("should not upsert while backoff is active");
      },
      touchPreviewAssetCache: async () => {},
    },
    analyzeVideoSource: async () => ({ durationSeconds: 42 }),
    fileExists: async () => false,
    generatePreviewAssets: async () => {
      generateCalled = true;
      return { thumbnailAssetPath: null, clipAssetPath: null };
    },
  });

  const result = await service.preparePreviewForPost({
    site: "coomer",
    post: makePost({
      site: "coomer",
      service: "onlyfans",
      file: { name: "video.mp4", path: "/coomer/video.mp4" },
    }),
    now,
  });

  assert.equal(generateCalled, false);
  assert.equal(result.previewStatus, "skipped-no-ffmpeg");
  assert.equal(result.previewOutcome, "skipped-no-ffmpeg");
});

test("popular preview asset service downloads a complete local source for premium priorities before generating previews", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-preview-premium-"));
  const mediaSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-source-premium-"));
  const now = new Date("2026-03-22T12:00:00.000Z");
  const previewWrites = [];
  const sourceWrites = [];
  const generateCalls = [];
  const downloadCalls = [];

  try {
    const service = createPopularPreviewAssetService({
      repository: {
        getPreviewAssetCache: async () => null,
        upsertPreviewAssetCache: async (input) => {
          previewWrites.push(input);
        },
        touchPreviewAssetCache: async () => {},
        listPreviewAssetCachesOlderThan: async () => [],
        deletePreviewAssetCaches: async () => undefined,
        getMediaSourceCache: async () => null,
        upsertMediaSourceCache: async (input) => {
          sourceWrites.push(input);
        },
        touchMediaSourceCache: async () => undefined,
        listExpiredMediaSourceCaches: async () => [],
        deleteMediaSourceCaches: async () => undefined,
        getMediaSourceCacheStats: async () => ({
          totalEntries: 0,
          totalSizeBytes: 0,
          readyEntries: 0,
          remoteHttpErrors: 0,
          toolMissing: 0,
        }),
        getPreviewAssetStats: async () => ({
          totalEntries: 0,
          readyEntries: 0,
          partialEntries: 0,
          failedEntries: 0,
        }),
      },
      previewAssetDir: tempDir,
      mediaSourceCacheDir: mediaSourceDir,
      analyzeVideoSource: async () => ({ durationSeconds: 41, mimeType: "video/mp4" }),
      downloadMediaSource: async (input) => {
        downloadCalls.push(input);
        return {
          localVideoPath: input.relativeSourcePath,
          fileSizeBytes: 8852604,
          mimeType: "video/mp4",
          downloadedAt: now,
        };
      },
      generatePreviewAssets: async (input) => {
        generateCalls.push(input);
        return {
          thumbnailAssetPath: input.paths.thumbnailAssetPath,
          clipAssetPath: input.paths.clipAssetPath,
        };
      },
      fileExists: async (relativePath, baseDir) => {
        if (baseDir === mediaSourceDir) {
          return relativePath.endsWith("source.mp4");
        }
        return false;
      },
    });

    const result = await service.preparePreviewForPost({
      site: "coomer",
      post: makePost({
        site: "coomer",
        service: "fansly",
        file: { name: "video.mp4", path: "/coomer/video.mp4" },
      }),
      now,
      priorityClass: "popular",
    });

    assert.equal(downloadCalls.length, 1);
    assert.equal(sourceWrites.length, 2);
    assert.equal(sourceWrites[0]?.downloadStatus, "source-downloading");
    assert.equal(sourceWrites[0]?.priorityClass, "popular");
    assert.equal(sourceWrites[1]?.downloadStatus, "source-ready");
    assert.equal(sourceWrites[1]?.priorityClass, "popular");
    assert.equal(generateCalls.length, 1);
    assert.match(generateCalls[0]?.sourceVideoUrl ?? "", /source\.mp4$/);
    assert.equal(result.previewOutcome, "generated");
    assert.equal(result.previewStatus, "ready");
    assert.equal(previewWrites[0]?.status, "ready");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(mediaSourceDir, { recursive: true, force: true });
  }
});