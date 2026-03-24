import test from "node:test";
import assert from "node:assert/strict";

import { readSessionUpstreamCache } from "../lib/session-upstream-cache.ts";

test("session upstream cache reuses fresh values and stale fallbacks", async () => {
  let nowMs = 1_000;
  const realNow = Date.now;
  Date.now = () => nowMs;

  try {
    const first = await readSessionUpstreamCache({
      keyParts: ["favorites", "creators", "coomer", "cookie-a"],
      freshTtlMs: 100,
      staleTtlMs: 1_000,
      loader: async () => ["a", "b"],
    });

    assert.equal(first.source, "live");
    assert.deepEqual(first.value, ["a", "b"]);

    const second = await readSessionUpstreamCache({
      keyParts: ["favorites", "creators", "coomer", "cookie-a"],
      freshTtlMs: 100,
      staleTtlMs: 1_000,
      loader: async () => {
        throw new Error("should not refetch while fresh");
      },
    });

    assert.equal(second.source, "fresh");
    assert.deepEqual(second.value, ["a", "b"]);

    nowMs += 500;

    const third = await readSessionUpstreamCache({
      keyParts: ["favorites", "creators", "coomer", "cookie-a"],
      freshTtlMs: 100,
      staleTtlMs: 1_000,
      loader: async () => {
        throw new Error("upstream unavailable");
      },
    });

    assert.equal(third.source, "stale");
    assert.deepEqual(third.value, ["a", "b"]);
  } finally {
    Date.now = realNow;
  }
});
