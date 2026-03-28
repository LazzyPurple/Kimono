import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolvePostMedia } from "../lib/api/helpers.ts";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

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
    file: { name: "cover.jpg", path: "/abc/cover.jpg" },
    attachments: [{ name: "video.mp4", path: "/abc/video.mp4" }],
    ...overrides,
  };
}

test("resolvePostMedia uses CDN thumbnails for preview images while keeping full data URLs for videos", () => {
  const media = resolvePostMedia(makePost());

  assert.equal(media.previewImageUrl, "https://img.kemono.cr/thumbnail/data/abc/cover.jpg");
  assert.equal(media.videoUrl, "https://kemono.cr/data/abc/video.mp4");
});

test("root layout preconnects the upstream image and data origins", () => {
  const source = read("app/layout.tsx");

  assert.match(source, /rel="preconnect" href="https:\/\/img\.kemono\.cr"/);
  assert.match(source, /rel="preconnect" href="https:\/\/img\.coomer\.st"/);
  assert.match(source, /rel="preconnect" href="https:\/\/kemono\.cr"/);
  assert.match(source, /rel="preconnect" href="https:\/\/coomer\.st"/);
});

test("preview asset route advertises immutable long-lived cache headers", () => {
  const source = read("app/api/media/preview/[...path]/route.ts");

  assert.match(source, /public, max-age=86400, stale-while-revalidate=604800, immutable/);
});

test("media and creator cards send no-referrer on remote images", () => {
  const mediaCard = read("components/MediaCard.tsx");
  const creatorCard = read("components/CreatorCard.tsx");

  assert.equal((mediaCard.match(/referrerPolicy="no-referrer"/g) ?? []).length, 2);
  assert.equal((creatorCard.match(/referrerPolicy="no-referrer"/g) ?? []).length, 2);
});
