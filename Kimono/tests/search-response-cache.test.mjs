import test from "node:test";
import assert from "node:assert/strict";

import { shouldCacheSearchResponse } from "../lib/search-response-cache.ts";

test("search response cache skips degraded stale-cache payloads", () => {
  assert.equal(shouldCacheSearchResponse({ source: "stale-cache" }), false);
  assert.equal(shouldCacheSearchResponse({ source: "live-refresh" }), true);
  assert.equal(shouldCacheSearchResponse({ source: "db-cache" }), true);
  assert.equal(shouldCacheSearchResponse(undefined), true);
});
