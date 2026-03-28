import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("useTurboVideo reduces buffering pressure, reacts to page visibility and skips non-mp4 MSE attempts", () => {
  const source = read("hooks/useTurboVideo.ts");

  assert.match(source, /concurrentRequests = 2/);
  assert.match(source, /maxBufferAhead = 16 \* 1024 \* 1024/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.visibilityState/);
  assert.match(source, /looksLikeMp4Source|canUseMediaSourcePlayback/);
});

test("VideoPlayer starts playback without waiting on local warm, can disable turbo, and handles video errors explicitly", () => {
  const source = read("components/VideoPlayer.tsx");

  assert.match(source, /\/api\/media\/warm/);
  assert.match(source, /localStreamUrl/);
  assert.match(source, /sourceFingerprint/);
  assert.match(source, /addEventListener\("error"/);
  assert.match(source, /BroadcastChannel|navigator\.locks/);
  assert.match(source, /isTogglingRef/);
  assert.match(source, /\/api\/media\/download/);
  assert.match(source, /turboEnabled\?: boolean/);
  assert.match(source, /turboEnabled = true/);
  assert.match(source, /const turboInputUrl = turboEnabled && activeSourceUrl === source\.upstreamUrl/);
  assert.match(source, /void .*Warm.*\(/);
  assert.doesNotMatch(source, /await ensurePlaybackSource/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /12000/);
});

test("MediaCard no longer probes video durations client-side in the background", () => {
  const source = read("components/MediaCard.tsx");

  assert.match(source, /document\.visibilityState/);
  assert.doesNotMatch(source, /document\.createElement\("video"\)/);
  assert.doesNotMatch(source, /durationProbeQueue|durationProbeActiveCount/);
  assert.doesNotMatch(source, /12000/);
  assert.doesNotMatch(source, /requestIdleCallback/);
});

test("MediaCard defaults to viewport previews while still supporting an explicit disabled mode", () => {
  const source = read("components/MediaCard.tsx");

  assert.match(source, /videoPreviewMode\?: "hover" \| "viewport" \| "disabled"/);
  assert.match(source, /videoPreviewMode = "viewport"/);
  assert.match(source, /videoPreviewMode !== "disabled"/);
});
