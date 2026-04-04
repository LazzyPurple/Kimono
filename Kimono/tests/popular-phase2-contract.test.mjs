import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("phase 2 popular exposes a DB-first posts route and a real page", () => {
  assert.equal(
    existsSync(new URL("../app/api/posts/popular/route.ts", import.meta.url)),
    true,
    "popular API route should exist",
  );

  const routeSource = readFileSync(new URL("../app/api/posts/popular/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /withDbConnection/);
  assert.doesNotMatch(routeSource, /fetchPopularPostsFromSite|hybridContent/i);

  const pageSource = readFileSync(new URL("../app/(main)/popular/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /ComingSoonPage/);
  assert.match(pageSource, /Popular/i);
  assert.match(pageSource, /MediaCard/);
});
