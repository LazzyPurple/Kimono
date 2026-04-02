import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

test("Phase 1 removes the aggressive video stack files", () => {
  assert.equal(exists("hooks/useTurboVideo.ts"), false);
  assert.equal(exists("hooks/use-turbo-video.ts"), false);
  assert.equal(exists("lib/video-preview-cache.ts"), false);
  assert.equal(exists("lib/turbo-video-memory-cache.ts"), false);
});

test("Phase 1 rewrites VideoPlayer as a native preload-none player", () => {
  const source = read("components/VideoPlayer.tsx");
  assert.doesNotMatch(source, /useTurboVideo/);
  assert.doesNotMatch(source, /MediaSource/);
  assert.doesNotMatch(source, /SourceBuffer/);
  assert.doesNotMatch(source, /BroadcastChannel/);
  assert.doesNotMatch(source, /\/api\/media\/warm/);
  assert.match(source, /preload="none"/);
});

test("Phase 1 rewrites MediaCard without aggressive preview prefetch", () => {
  const source = read("components/MediaCard.tsx");
  assert.doesNotMatch(source, /video-preview-cache/);
  assert.doesNotMatch(source, /preload="metadata"/);
  assert.doesNotMatch(source, /preload="auto"/);
  assert.doesNotMatch(source, /rootMargin:\s*"(?!200px 0px)/);
  assert.match(source, /preload="none"/);
  assert.match(source, /getThumbnailUrl/);
});

test("Phase 1 scaffolds the new app/(main) route tree", () => {
  const pages = [
    "app/(main)/layout.tsx",
    "app/(main)/home/page.tsx",
    "app/(main)/search/page.tsx",
    "app/(main)/popular/page.tsx",
    "app/(main)/favorites/page.tsx",
    "app/(main)/discover/page.tsx",
    "app/(main)/admin/page.tsx",
    "app/(main)/creators/[site]/[id]/page.tsx",
    "app/(main)/posts/[site]/[id]/page.tsx",
  ];

  for (const page of pages) {
    assert.equal(exists(page), true, `${page} should exist`);
  }
});

test("Phase 1 removes the old protected route group shell", () => {
  assert.equal(exists("app/(protected)"), false);
});

test("Phase 1 simplifies hydration helpers away from preview orchestration", () => {
  assert.equal(exists("lib/post-preview-hydration.ts"), false);
});
