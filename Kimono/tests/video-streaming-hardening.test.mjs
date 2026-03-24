import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("useTurboVideo reduces buffering pressure and reacts to page visibility", () => {
  const source = read("hooks/useTurboVideo.ts");

  assert.match(source, /concurrentRequests = 2/);
  assert.match(source, /maxBufferAhead = 16 \* 1024 \* 1024/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.visibilityState/);
});

test("VideoPlayer warms local media sources before falling back upstream", () => {
  const source = read("components/VideoPlayer.tsx");

  assert.match(source, /\/api\/media-source\/warm/);
  assert.match(source, /localStreamUrl/);
  assert.match(source, /sourceFingerprint/);
  assert.match(source, /setInterval/);
  assert.match(source, /12000/);
});

test("MediaCard keeps server clips conservative until the preview is actually active", () => {
  const source = read("components/MediaCard.tsx");

  assert.match(source, /document\.visibilityState/);
  assert.match(source, /durationProbeQueue|durationProbeActiveCount/);
  assert.doesNotMatch(source, /const videoPreload = hasServerClip \? "auto"/);
});
