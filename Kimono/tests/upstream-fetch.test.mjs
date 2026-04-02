import test from "node:test";
import assert from "node:assert/strict";

import { fetchUpstreamJson, fetchUpstreamResponse, fetchUpstreamText, UpstreamFetchError } from "../lib/api/upstream-fetch.ts";
import { getGlobalUpstreamRateGuard } from "../lib/api/upstream-rate-guard.ts";

const originalFetch = globalThis.fetch;

function clearCooldowns() {
  const guard = getGlobalUpstreamRateGuard();
  guard.clear("kemono");
  guard.clear("coomer");
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  clearCooldowns();
});

test("fetchUpstreamJson parses JSON responses", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.headers?.Accept, "text/css");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await fetchUpstreamJson({
    site: "kemono",
    url: "https://kemono.cr/api/v1/recent",
  });

  assert.deepEqual(result, { ok: true });
});

test("fetchUpstreamText returns plain text bodies", async () => {
  globalThis.fetch = async () => new Response('[{"id":"1"}]', { status: 200 });

  const result = await fetchUpstreamText({
    site: "coomer",
    url: "https://coomer.st/api/v1/creators.txt",
  });

  assert.equal(result, '[{"id":"1"}]');
});

test("fetchUpstreamResponse retries on 500 responses", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response("nope", { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const response = await fetchUpstreamResponse({
    site: "kemono",
    url: "https://kemono.cr/api/v1/recent",
    retryDelaysMs: [0],
  });

  assert.equal(response.status, 200);
  assert.equal(callCount, 2);
});

test("fetchUpstreamResponse does not retry on 403 responses", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response("forbidden", { status: 403 });
  };

  await assert.rejects(
    () => fetchUpstreamResponse({
      site: "kemono",
      url: "https://kemono.cr/api/v1/account/favorites",
      retryDelaysMs: [0],
    }),
    (error) => {
      assert.equal(error instanceof UpstreamFetchError, true);
      assert.equal(error.status, 403);
      return true;
    }
  );

  assert.equal(callCount, 1);
});

test("fetchUpstreamResponse registers cooldowns on 429 responses", async () => {
  globalThis.fetch = async () => new Response("limited", {
    status: 429,
    headers: { "retry-after": "5" },
  });

  await assert.rejects(
    () => fetchUpstreamResponse({
      site: "coomer",
      url: "https://coomer.st/api/v1/account/favorites",
      retryDelaysMs: [0],
    }),
    (error) => {
      assert.equal(error instanceof UpstreamFetchError, true);
      assert.equal(error.status, 429);
      return true;
    }
  );

  const decision = getGlobalUpstreamRateGuard().canRequest("coomer", "account");
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterMs > 0, true);
});

test("fetchUpstreamResponse aborts on timeout", async () => {
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    () => fetchUpstreamResponse({
      site: "kemono",
      url: "https://kemono.cr/api/v1/recent",
      timeoutMs: 10,
      retryDelaysMs: [],
    }),
    (error) => {
      assert.equal(error instanceof UpstreamFetchError, true);
      assert.match(error.message, /timed out/i);
      return true;
    }
  );
});
