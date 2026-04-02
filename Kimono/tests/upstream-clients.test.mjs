import test from "node:test";
import assert from "node:assert/strict";

import { fetchCreatorPosts, fetchFavorites } from "../lib/api/kemono.ts";
import { fetchAllCreatorsFromSite, fetchPopularPostsFromSite, fetchPostDetailFromSite } from "../lib/api/upstream.ts";
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

test("fetchAllCreatorsFromSite falls back from creators.txt to creators", async () => {
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).endsWith("/creators.txt")) {
      return new Response("forbidden", { status: 403 });
    }
    return new Response('[{"id":"42","name":"Maple","service":"patreon","indexed":"","updated":"","favorited":5}]', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await fetchAllCreatorsFromSite("kemono");

  assert.equal(seen.length, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "42");
});

test("fetchPopularPostsFromSite preserves info props and posts", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    info: { site: "kemono" },
    props: { page: 1 },
    posts: [{ id: "1" }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await fetchPopularPostsFromSite({
    site: "kemono",
    period: "recent",
    offset: 50,
  });

  assert.deepEqual(result, {
    info: { site: "kemono" },
    props: { page: 1 },
    posts: [{ id: "1" }],
  });
});

test("fetchPostDetailFromSite unwraps embedded post payloads", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.headers?.Cookie, "session=abc");
    return new Response(JSON.stringify({ post: { id: "post-1", title: "Hello" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await fetchPostDetailFromSite({
    site: "coomer",
    service: "fansly",
    creatorId: "creator-1",
    postId: "post-1",
    cookie: "session=abc",
  });

  assert.deepEqual(result, { id: "post-1", title: "Hello" });
});

test("fetchCreatorPosts keeps query params tags and browser headers", async () => {
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("o"), "25");
    assert.equal(parsed.searchParams.get("q"), "christmas");
    assert.deepEqual(parsed.searchParams.getAll("tag"), ["video", "loop"]);
    assert.equal(init?.headers?.Accept, "text/css");
    assert.equal(init?.headers?.Cookie, "session=xyz");

    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await fetchCreatorPosts("fanbox", "37736", 25, "session=xyz", "christmas", ["video", "loop"]);
  assert.deepEqual(result, []);
});

test("fetchFavorites sends authenticated account request", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/account\/favorites\?type=artist$/);
    assert.equal(init?.headers?.Cookie, "session=abc");
    assert.equal(init?.headers?.Accept, "text/css");
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await fetchFavorites("session=abc");
  assert.deepEqual(result, []);
});
