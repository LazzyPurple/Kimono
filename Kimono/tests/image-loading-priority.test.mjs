import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("MediaCard exposes a priority prop and toggles image loading hints", () => {
  const source = read("components/MediaCard.tsx");

  assert.match(source, /priority\?: boolean;/);
  assert.match(source, /priority = false/);
  assert.match(source, /loading=\{priority \? undefined : "lazy"\}/);
  assert.match(source, /fetchPriority=\{priority \? "high" : undefined\}/);
});

test("MediaCard consumes shared media metadata for richer placeholders", () => {
  const source = read("components/MediaCard.tsx");

  assert.match(source, /mediaWidth\?: number \| null;/);
  assert.match(source, /mediaHeight\?: number \| null;/);
  assert.match(source, /mediaMimeType\?: string \| null;/);
  assert.match(source, /const resolutionLabel = mediaWidth != null && mediaHeight != null/);
  assert.doesNotMatch(source, /const formatLabel = mediaMimeType/);
  assert.doesNotMatch(source, /mediaMetaLabel/);
});

test("listing pages prioritize the first four MediaCard instances and forward shared media metadata", () => {
  const home = read("app/(protected)/home/page.tsx");
  const popular = read("app/(protected)/popular/[site]/[[...page]]/page.tsx");
  const creator = read("app/(protected)/creator/[site]/[service]/[id]/page.tsx");
  const favorites = read("app/(protected)/favorites/page.tsx");

  assert.match(home, /posts\.map\(\(post, index\) =>/);
  assert.match(home, /priority=\{index < 4\}/);
  assert.match(home, /mediaWidth=\{media\.width\}/);
  assert.match(home, /mediaHeight=\{media\.height\}/);
  assert.match(home, /mediaMimeType=\{media\.mimeType\}/);
  assert.match(home, /videoPreviewMode="viewport"/);

  assert.match(popular, /data\.posts\.map\(\(post, index\) =>/);
  assert.match(popular, /priority=\{index < 4\}/);
  assert.match(popular, /mediaWidth=\{media\.width\}/);
  assert.match(popular, /mediaHeight=\{media\.height\}/);
  assert.match(popular, /mediaMimeType=\{media\.mimeType\}/);
  assert.match(popular, /videoPreviewMode="viewport"/);
  assert.match(popular, /detailSource="popular"/);
  assert.match(creator, /visiblePosts\.map\(\(post, index\) =>/);
  assert.match(creator, /priority=\{index < 4\}/);
  assert.match(creator, /mediaWidth=\{media\.width\}/);
  assert.match(creator, /mediaHeight=\{media\.height\}/);
  assert.match(creator, /mediaMimeType=\{media\.mimeType\}/);
  assert.match(creator, /videoPreviewMode="viewport"/);

  assert.match(favorites, /paginatedPosts\.map\(\(post, index\) =>/);
  assert.match(favorites, /mediaWidth=\{media\.width\}/);
  assert.match(favorites, /mediaHeight=\{media\.height\}/);
  assert.match(favorites, /mediaMimeType=\{media\.mimeType\}/);
});

test("post gallery keeps the first image eager and lazy-loads the rest", () => {
  const postPage = read("app/(protected)/post/[site]/[service]/[user]/[id]/page.tsx");

  assert.match(postPage, /images\.map\(\(media, index\) =>/);
  assert.match(postPage, /loading=\{index === 0 \? undefined : "lazy"\}/);
});

