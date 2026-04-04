import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("phase 2 creator exposes DB-first routes and a real page", () => {
  assert.equal(
    existsSync(new URL("../app/api/creators/[site]/[id]/route.ts", import.meta.url)),
    true,
    "creator API route should exist",
  );
  assert.equal(
    existsSync(new URL("../app/api/creators/[site]/[id]/posts/route.ts", import.meta.url)),
    true,
    "creator posts API route should exist",
  );

  const routeSource = readFileSync(new URL("../app/api/creators/[site]/[id]/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /getCreatorPageData/);
  assert.doesNotMatch(routeSource, /ComingSoonPage|hybridContent/i);

  const postsRouteSource = readFileSync(new URL("../app/api/creators/[site]/[id]/posts/route.ts", import.meta.url), "utf8");
  assert.match(postsRouteSource, /getCreatorPageData/);
  assert.doesNotMatch(postsRouteSource, /ComingSoonPage|hybridContent/i);

  const helperSource = readFileSync(new URL("../lib/creators/creator-page.ts", import.meta.url), "utf8");
  assert.match(helperSource, /withDbConnection/);
  assert.match(helperSource, /db\.getCreatorBySiteAndId/);
  assert.match(helperSource, /db\.getCreatorPosts/);

  const pageSource = readFileSync(new URL("../app/(main)/creators/[site]/[id]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /ComingSoonPage/);
  assert.match(pageSource, /Creator/i);
  assert.match(pageSource, /MediaCard/);
});

test("creator phase wires likes provider and creator favorite routes", () => {
  const providersSource = readFileSync(new URL("../components/Providers.tsx", import.meta.url), "utf8");
  assert.match(providersSource, /LikesProvider/);

  assert.equal(
    existsSync(new URL("../app/api/favorites/route.ts", import.meta.url)),
    true,
    "favorites API route should exist for likes bootstrap",
  );
  assert.equal(
    existsSync(new URL("../app/api/favorites/creators/[site]/[service]/[creatorId]/route.ts", import.meta.url)),
    true,
    "favorite creator mutation route should exist",
  );
});
