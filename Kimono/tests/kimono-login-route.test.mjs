import test from "node:test";
import assert from "node:assert/strict";

import { processKimonoLogin } from "../lib/kimono-login-route.ts";
import { createUpstreamRateGuard } from "../lib/api/upstream-rate-guard.ts";

function makeInput(overrides = {}) {
  return {
    site: "coomer",
    username: "alice",
    password: "secret",
    rateGuard: createUpstreamRateGuard(),
    ...overrides,
  };
}

test("kimono login returns 429 and retry metadata when upstream rate limits the request", async () => {
  const result = await processKimonoLogin(makeInput({
    loginRequest: async () => ({
      status: 429,
      data: { error: "Too Many Requests" },
      headers: { "retry-after": "15" },
    }),
  }));

  assert.equal(result.status, 429);
  assert.match(result.body.error ?? "", /limitee/i);
  assert.equal(typeof result.body.retryAfterMs, "number");
  assert.equal(result.body.retryAfterMs <= 15_000 && result.body.retryAfterMs >= 14_000, true);
  assert.equal(result.headers?.["Retry-After"], "15");
});

test("kimono login short-circuits while the upstream cooldown is still active", async () => {
  const rateGuard = createUpstreamRateGuard();
  const first = await processKimonoLogin(makeInput({
    site: "coomer",
    rateGuard,
    loginRequest: async () => ({
      status: 429,
      data: { error: "Too Many Requests" },
      headers: { "retry-after": "5" },
    }),
  }));
  assert.equal(first.status, 429);

  let wasCalled = false;
  const second = await processKimonoLogin(makeInput({
    site: "coomer",
    rateGuard,
    loginRequest: async () => {
      wasCalled = true;
      return { status: 200, headers: { "set-cookie": ["session=value; Path=/"] } };
    },
  }));

  assert.equal(second.status, 429);
  assert.equal(wasCalled, false);
  assert.match(second.body.error ?? "", /limitee/i);
});

test("kimono login maps credential failures to 401", async () => {
  const result = await processKimonoLogin(makeInput({
    site: "kemono",
    loginRequest: async () => ({
      status: 403,
      data: { error: "bad credentials" },
    }),
  }));

  assert.equal(result.status, 401);
  assert.equal(result.body.error, "bad credentials");
});

test("kimono login saves the session when upstream authentication succeeds", async () => {
  const saved = [];
  const result = await processKimonoLogin({
    site: "kemono",
    username: "maple",
    password: "pw",
    rateGuard: createUpstreamRateGuard(),
    loginRequest: async () => ({
      status: 200,
      headers: { "set-cookie": ["session=abc; Path=/; HttpOnly"] },
    }),
    saveSession: async (input) => {
      saved.push(input);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(saved, [{ site: "kemono", username: "maple", cookie: "session=abc" }]);
});
