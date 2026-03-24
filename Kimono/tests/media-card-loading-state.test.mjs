import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("MediaCard includes a skeleton placeholder for video cards while preview assets are still missing", () => {
  const source = read("components/MediaCard.tsx");

  assert.match(source, /showVideoSkeleton/);
  assert.match(source, /animate-pulse/);
  assert.match(source, /skeletonToneClass/);
  assert.match(source, /bg-gradient-to-br/);
  assert.match(source, /Preparing/);
});

test("MediaCard keeps shell cards visually minimal by removing the format chip and attachment counter", () => {
  const source = read("components/MediaCard.tsx");

  assert.doesNotMatch(source, /mediaMetaLabel/);
  assert.doesNotMatch(source, /const formatLabel = mediaMimeType/);
  assert.doesNotMatch(source, /resolvedVideoCandidates\.length > 1/);
  assert.doesNotMatch(source, /videos<\/span>/);
});
