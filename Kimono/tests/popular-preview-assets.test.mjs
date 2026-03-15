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
