import test from "node:test";
import assert from "node:assert/strict";

import {
  createUpstreamRateGuard,
  createRateLimitError,
} from "../lib/api/upstream-rate-guard.ts";

test("upstream rate guard blocks requests during the cooldown window after a 429", async () => {
  const guard = createUpstreamRateGuard({ cooldownMs: 10_000, now: () => Date.UTC(2026, 2, 19, 12, 0, 0) });

  guard.registerRateLimit("coomer", { status: 429 });

  assert.equal(guard.canRequest("coomer").allowed, false);
  assert.match(guard.canRequest("coomer").reason ?? "", /cooldown/i);
});

test("upstream rate guard respects Retry-After when it is longer than the default cooldown", async () => {
  const guard = createUpstreamRateGuard({ cooldownMs: 10_000, now: () => Date.UTC(2026, 2, 19, 12, 0, 0) });

  guard.registerRateLimit("coomer", {
    status: 429,
    headers: { "retry-after": "25" },
  });

  const decision = guard.canRequest("coomer");
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterMs, 25_000);
});

test("createRateLimitError carries a synthetic upstream cooldown status", () => {
  const error = createRateLimitError("coomer", 4_000);
  assert.equal(error.name, "UpstreamCooldownError");
  assert.equal(error.status, 429);
  assert.equal(error.code, "UPSTREAM_COOLDOWN");
  assert.equal(error.site, "coomer");
  assert.equal(error.retryAfterMs, 4_000);
});


test("upstream rate guard isolates cooldowns by bucket", async () => {
  const guard = createUpstreamRateGuard({ cooldownMs: 10_000, now: () => Date.UTC(2026, 2, 19, 12, 0, 0) });

  guard.registerRateLimit("coomer", { status: 429 }, "account");

  assert.equal(guard.canRequest("coomer", "account").allowed, false);
  assert.equal(guard.canRequest("coomer", "discover").allowed, true);
});

test("upstream rate guard persists cooldowns across instances when a persist path is configured", async () => {
  const tempPath = new URL('./tmp/upstream-rate-guard-state.json', import.meta.url);
  const guard = createUpstreamRateGuard({
    cooldownMs: 10_000,
    now: () => Date.UTC(2026, 2, 19, 12, 0, 0),
    persistPath: tempPath,
  });

  guard.registerRateLimit("kemono", { status: 429, headers: { "retry-after": "15" } }, "discover");

  const reloaded = createUpstreamRateGuard({
    cooldownMs: 10_000,
    now: () => Date.UTC(2026, 2, 19, 12, 0, 0),
    persistPath: tempPath,
  });

  const decision = reloaded.canRequest("kemono", "discover");
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterMs, 15_000);
});


test("upstream rate guard exposes active cooldown entries through snapshot()", () => {
  const guard = createUpstreamRateGuard({ cooldownMs: 10_000, now: () => Date.UTC(2026, 2, 20, 12, 0, 0) });

  guard.registerRateLimit("coomer", { status: 429, headers: { "retry-after": "12" } }, "discover");

  const entries = guard.snapshot();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.site, "coomer");
  assert.equal(entries[0]?.bucket, "discover");
  assert.equal(entries[0]?.retryAfterMs, 12_000);
});
