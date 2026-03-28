import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtimePath = path.join(process.cwd(), "lib/server/creator-sync-runtime.cjs");
const runtimeSource = fs.readFileSync(runtimePath, "utf8");

test("creator sync runtime uses the larger catalog timeout and expected sync cadence", () => {
  assert.match(runtimeSource, /CREATOR_INDEX_FRESHNESS_TTL_MS = 36 \* 60 \* 60 \* 1000/);
  assert.match(runtimeSource, /CREATOR_SYNC_INTERVAL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(runtimeSource, /LARGE_PAYLOAD_TIMEOUT_MS = 180000/);
  assert.match(runtimeSource, /UPSERT_BATCH_SIZE = 500/);
  assert.equal(runtimeSource.includes('Accept: "text/css"'), true);
  assert.match(runtimeSource, /SELECT cookie FROM KimonoSession/);
});

test("server boot references runCreatorSync runtime wrapper", () => {
  const serverSource = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");
  assert.match(serverSource, /runCreatorSync/);
  assert.match(serverSource, /creator-sync-runtime/);
  assert.match(serverSource, /continuing without blocking boot/);
  assert.match(serverSource, /void\s+\(async/);
  assert.equal(serverSource.includes("createServer("), true);
});
