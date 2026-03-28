import test from "node:test";
import assert from "node:assert/strict";
import * as helpers from "../lib/api/helpers.ts";

const { getPostVideoUrls, resolvePostMedia, resolveListingPostMedia } = helpers;

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
    file: { name: "", path: "" },
    attachments: [],
    ...overrides,
  };
}

test("resolvePostMedia exposes a direct preview image for image posts", () => {
  const media = resolvePostMedia(
    makePost({
      file: { name: "cover.jpg", path: "/abc/cover.jpg" },
    })
  );

  assert.deepEqual(media, {
    type: "image",
    previewImageUrl: "https://img.kemono.cr/thumbnail/data/abc/cover.jpg",
    videoUrl: undefined,
  });
});

test("resolvePostMedia falls back to attachment previews for attachment-first services", () => {
  const media = resolvePostMedia(
    makePost({
      service: "fansly",
      file: { name: "", path: "" },
      attachments: [
        { name: "clip.mp4", path: "/fan/clip.mp4" },
        { name: "preview.webp", path: "/fan/preview.webp" },
      ],
    })
  );

  assert.deepEqual(media, {
    type: "video",
    previewImageUrl: "https://img.kemono.cr/thumbnail/data/fan/preview.webp",
    videoUrl: "https://kemono.cr/data/fan/clip.mp4",
  });
});

test("resolvePostMedia returns a video-only preview when no image exists", () => {
  const media = resolvePostMedia(
    makePost({
      site: "coomer",
      file: { name: "video.mp4", path: "/coomer/video.mp4" },
    })
  );

  assert.deepEqual(media, {
    type: "video",
    previewImageUrl: undefined,
    videoUrl: "https://coomer.st/data/coomer/video.mp4",
  });
});

test("resolvePostMedia keeps text posts without preview urls", () => {
  const media = resolvePostMedia(makePost());

  assert.deepEqual(media, {
    type: "text",
    previewImageUrl: undefined,
    videoUrl: undefined,
  });
});

test("resolveListingPostMedia prefers server preview assets when available", () => {
  const media = resolveListingPostMedia(
    makePost({
      previewThumbnailUrl: "/api/media/preview/popular/kemono/fingerprint-1/thumb.webp",
      previewClipUrl: "/api/media/preview/popular/kemono/fingerprint-1/clip.mp4",
      longestVideoDurationSeconds: 95,
      file: { name: "video.mp4", path: "/abc/video.mp4" },
      attachments: [{ name: "alt-video.mp4", path: "/abc/alt-video.mp4" }],
    })
  );

  assert.deepEqual(media, {
    type: "video",
    previewImageUrl: "/api/media/preview/popular/kemono/fingerprint-1/thumb.webp",
    videoUrl: "/api/media/preview/popular/kemono/fingerprint-1/clip.mp4",
    videoCandidates: ["/api/media/preview/popular/kemono/fingerprint-1/clip.mp4"],
    durationSeconds: 95,
    previewStatus: null,
    usesServerPreview: true,
    mimeType: null,
    width: null,
    height: null,
  });
});

test("resolveListingPostMedia falls back to raw media when no server preview exists", () => {
  const post = makePost({
    file: { name: "video.mp4", path: "/abc/video.mp4" },
    attachments: [{ name: "alt-video.mp4", path: "/abc/alt-video.mp4" }],
  });
  const media = resolveListingPostMedia(post);

  assert.deepEqual(media, {
    type: "video",
    previewImageUrl: undefined,
    videoUrl: "https://kemono.cr/data/abc/video.mp4",
    videoCandidates: getPostVideoUrls(post),
    durationSeconds: null,
    previewStatus: null,
    usesServerPreview: false,
    mimeType: null,
    width: null,
    height: null,
  });
});

test("resolveListingPostMedia keeps a server thumbnail without falling back to the raw video when the clip is still pending", () => {
  const media = resolveListingPostMedia(
    makePost({
      site: "coomer",
      service: "onlyfans",
      previewThumbnailUrl: "/api/media/preview/popular/coomer/fingerprint-1/thumb.webp",
      previewClipUrl: null,
      previewStatus: "thumbnail-ready",
      longestVideoDurationSeconds: 41,
      file: { name: "video.mp4", path: "/coomer/video.mp4" },
    })
  );

  assert.deepEqual(media, {
    type: "video",
    previewImageUrl: "/api/media/preview/popular/coomer/fingerprint-1/thumb.webp",
    videoUrl: undefined,
    videoCandidates: [],
    durationSeconds: 41,
    previewStatus: "thumbnail-ready",
    usesServerPreview: true,
    mimeType: null,
    width: null,
    height: null,
  });
});

test("resolveListingPostMedia falls back to a native upstream thumbnail before showing a video shell", () => {
  const media = resolveListingPostMedia(
    makePost({
      site: "coomer",
      service: "fansly",
      nativeThumbnailUrl: "https://img.coomer.st/thumbnail/data/fan/native-preview.jpg",
      file: { name: "video.mp4", path: "/fan/video.mp4" },
    })
  );

  assert.deepEqual(media, {
    type: "video",
    previewImageUrl: "https://img.coomer.st/thumbnail/data/fan/native-preview.jpg",
    videoUrl: "https://coomer.st/data/fan/video.mp4",
    videoCandidates: ["https://coomer.st/data/fan/video.mp4"],
    durationSeconds: null,
    previewStatus: null,
    usesServerPreview: false,
    mimeType: null,
    width: null,
    height: null,
  });
});

test("resolveListingPostMedia forwards enriched media metadata to shared cards", () => {
  const media = resolveListingPostMedia(
    makePost({
      file: { name: "video.mp4", path: "/abc/video.mp4" },
      mediaMimeType: "video/mp4",
      mediaWidth: 1080,
      mediaHeight: 1920,
      longestVideoDurationSeconds: 41,
    })
  );

  assert.equal(media.mimeType, "video/mp4");
  assert.equal(media.width, 1080);
  assert.equal(media.height, 1920);
});
