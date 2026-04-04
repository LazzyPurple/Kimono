import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("phase 2 search exposes a DB-first creators search route and a real page", () => {
  assert.equal(
    existsSync(new URL("../app/api/creators/search/route.ts", import.meta.url)),
    true,
    "search API route should exist",
  );

  const routeSource = readFileSync(new URL("../app/api/creators/search/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /withDbConnection/);
  assert.match(routeSource, /db\.searchCreators/);
  assert.doesNotMatch(routeSource, /fetchAllCreatorsFromSite|searchKemonoCreators|searchCoomerCreators|hybridContent/i);

  const pageSource = readFileSync(new URL("../app\/\(main\)\/search\/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /ComingSoonPage/);
  assert.match(pageSource, /Search/i);
});

test("search repository uses PostgreSQL full-text search instead of ILIKE", () => {
  const source = readFileSync(new URL("../lib/db/repository.ts", import.meta.url), "utf8");
  assert.match(source, /to_tsvector/i);
  assert.match(source, /plainto_tsquery/i);
  assert.doesNotMatch(source, /normalizedName ILIKE|name ILIKE|creatorId ILIKE/);
});

test("CreatorCard targets the phase 2 creator route shape", () => {
  const source = readFileSync(new URL("../components/CreatorCard.tsx", import.meta.url), "utf8");
  assert.match(source, /href=\{?`\/creators\/\$\{site\}\/\$\{id\}`/);
  assert.doesNotMatch(source, /\/creator\/\$\{site\}\/\$\{service\}\/\$\{id\}/);
});
