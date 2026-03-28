import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

test("upstream API clients stop retrying rate-limited responses and let the cooldown guard take over", () => {
  const coomerSource = read("lib/api/coomer.ts");
  const kemonoSource = read("lib/api/kemono.ts");

  for (const source of [coomerSource, kemonoSource]) {
    assert.match(source, /if \(status === 429\) \{[\s\S]*registerRateLimit[\s\S]*throw error;[\s\S]*\}/);
    assert.doesNotMatch(source, /status === 429 \|\| status >= 500/);
    assert.match(source, /status === 0 \|\| status >= 500/);
  }
});

test("favorite creator route returns explicit upstream cooldown metadata instead of collapsing 429 into 500", () => {
  const source = read("app/api/favorites/creators/[site]/[service]/[creatorId]/route.ts");

  assert.match(source, /getGlobalUpstreamRateGuard/);
  assert.match(source, /buildRateLimitedResponse/);
  assert.match(source, /status: 429/);
  assert.match(source, /"Retry-After"/);
  assert.match(source, /Session expired/);
});
