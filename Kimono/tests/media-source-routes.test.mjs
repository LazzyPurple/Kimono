import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("media source stream route supports ranged local streaming with cache headers", () => {
  const source = read("app/api/media-source/[site]/[sourceFingerprint]/route.ts");

  assert.match(source, /createReadStream/);
  assert.match(source, /status:\s*206/);
  assert.match(source, /accept-ranges["']:\s*["']bytes["']/);
  assert.match(source, /cache-control["']:\s*["']public, max-age=86400, stale-while-revalidate=604800, immutable["']/);
  assert.match(source, /content-range["']:\s*[`"']bytes \*\/\$\{totalSize\}[`"']/);
});

test("media source warm route validates post video paths instead of accepting arbitrary urls", () => {
  const source = read("app/api/media-source/warm/route.ts");

  assert.match(source, /path/);
  assert.match(source, /creatorId/);
  assert.match(source, /postId/);
  assert.match(source, /service/);
  assert.match(source, /getPostDetail/);
  assert.doesNotMatch(source, /sourceVideoUrl\s*:/);
});
