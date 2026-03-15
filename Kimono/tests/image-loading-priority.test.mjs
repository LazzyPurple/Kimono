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

test("listing pages prioritize the first four MediaCard instances", () => {
  const home = read("app/(protected)/home/page.tsx");
  const popular = read("app/(protected)/popular/[site]/[[...page]]/page.tsx");
  const creator = read("app/(protected)/creator/[site]/[service]/[id]/page.tsx");

  assert.match(home, /posts\.map\(\(post, index\) =>/);
  assert.match(home, /priority=\{index < 4\}/);
  assert.match(popular, /data\.posts\.map\(\(post, index\) =>/);
  assert.match(popular, /priority=\{index < 4\}/);
  assert.match(creator, /filteredPosts\.map\(\(post, index\) =>/);
  assert.match(creator, /priority=\{index < 4\}/);
});

test("post gallery keeps the first image eager and lazy-loads the rest", () => {
  const postPage = read("app/(protected)/post/[site]/[service]/[user]/[id]/page.tsx");

  assert.match(postPage, /images\.map\(\(media, index\) =>/);
  assert.match(postPage, /loading=\{index === 0 \? undefined : "lazy"\}/);
});
