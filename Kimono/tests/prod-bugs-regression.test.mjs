import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("creator posts route is DB-first and persists upstream results into Post", () => {
  const source = read("app/api/creators/[site]/[service]/[id]/posts/route.ts");

  assert.match(source, /db\.getCreatorPosts\(/);
  assert.match(source, /db\.upsertPosts\(/);
  assert.doesNotMatch(source, /hybridContent\.getCreatorPosts\(/);
});

test("post detail route delegates to hybrid content and the post page busts stale preview-shaped browser cache", () => {
  const routeSource = read("app/api/posts/[site]/[service]/[creatorId]/[postId]/route.ts");
  const pageSource = read("app/(protected)/post/[site]/[service]/[user]/[id]/page.tsx");

  assert.match(routeSource, /hybridContent\.getPostDetail\(/);
  assert.doesNotMatch(routeSource, /db\.getPostById\(/);
  assert.doesNotMatch(routeSource, /NextResponse\.json\(cached/);
  assert.match(pageSource, /post-detail:v2:/);
  assert.match(pageSource, /turboEnabled=\{postSource !== "popular"\}/);
});

test("admin helpers target reconstructed table names only", () => {
  const adminDb = read("lib/admin/admin-db.ts");
  const serverHealth = read("lib/server-health.ts");

  for (const legacyName of [
    "CreatorIndex",
    "PostCache",
    "PreviewAssetCache",
    "MediaSourceCache",
    "FavoriteSnapshot",
    "CreatorSearchCache",
    "PopularSnapshot",
    "CreatorSnapshot",
    "CreatorsCache",
  ]) {
    assert.equal(adminDb.includes(legacyName), false, `admin-db should not reference ${legacyName}`);
    assert.equal(serverHealth.includes(legacyName), false, `server-health should not reference ${legacyName}`);
  }

  for (const currentName of ["Creator", "Post", "MediaAsset", "MediaSource", "FavoriteCache", "FavoriteChronology", "KimonoSession"]) {
    assert.equal(adminDb.includes(currentName) || serverHealth.includes(currentName), true, `expected admin helpers to reference ${currentName}`);
  }
});

test("admin pages expose an explicit render fallback instead of crashing blindly", () => {
  for (const file of ["app/admin/page.tsx", "app/admin/health/page.tsx", "app/admin/db/page.tsx"]) {
    const source = read(file);
    assert.match(source, /try\s*\{/);
    assert.match(source, /catch\s*\(/);
    assert.match(source, /AdminErrorFallback/);
  }
});

test("favorites chronology supports descending favedSeq ordering and the Faved Date label", () => {
  const types = read("lib/db/types.ts");
  const repo = read("lib/db/repository.ts");
  const favoritesState = read("lib/favorites-page-state.ts");
  const favoritesPage = read("app/(protected)/favorites/page.tsx");
  const migration = read("deploy/migrations/v2-fix-favorite-chronology.sql");

  assert.match(types, /favedSeq:\s*number\s*\|\s*null/);
  assert.match(repo, /favedSeq/);
  assert.match(favoritesState, /favedSeq/);
  assert.match(favoritesState, /return right\.favedSeq - left\.favedSeq/);
  assert.match(favoritesState, /return rightAddedAt - leftAddedAt/);
  assert.match(migration, /ALTER TABLE `FavoriteChronology`/);
  assert.match(migration, /favedSeq/);
  assert.match(favoritesPage, /Faved Date/);
  assert.doesNotMatch(favoritesPage, /Added first/);
});

test("favorites payload helpers no longer depend on legacy data-store/performance repository paths", () => {
  const creatorFavorites = read("lib/kimono-favorites-route.ts");
  const postFavorites = read("lib/likes-posts-route.ts");

  for (const source of [creatorFavorites, postFavorites]) {
    assert.doesNotMatch(source, /getDataStore/);
    assert.doesNotMatch(source, /getPerformanceRepository/);
    assert.match(source, /withDbConnection/);
    assert.match(source, /db\./);
  }
});

test("popular page keeps preview warmup active while tagging detail navigation as popular", () => {
  const source = read("app/(protected)/popular/[site]/[[...page]]/page.tsx");

  assert.doesNotMatch(source, /videoPreviewMode="disabled"/);
  assert.match(source, /videoPreviewMode="viewport"/);
  assert.match(source, /detailSource="popular"/);
});

test("creators search route normalizes the current UI filter contract", () => {
  const source = read("app/api/creators/search/route.ts");

  assert.match(source, /searchParams\.get\("filter"\)/);
  assert.match(source, /serviceRaw/);
  assert.match(source, /serviceRaw\s*===\s*"Tous"/);
  assert.match(source, /id:\s*row\.creatorId/);
});

test("favorites page consumes the unified favorites payload with a single request per site", () => {
  const source = read("app/(protected)/favorites/page.tsx");

  assert.doesNotMatch(source, /Promise\.allSettled\(/);
  assert.match(source, /fetchJson<FavoritesPayload>\(`\/api\/favorites\?site=\$\{site\}`\)/);
});

test("remote session no longer depends on the legacy data store adapter", () => {
  const source = read("lib/remote-session.ts");

  assert.doesNotMatch(source, /getDataStore/);
  assert.match(source, /withDbConnection/);
  assert.match(source, /db\.getLatestKimonoSession/);
});


test("favorite chronology queries stay backward compatible when favedSeq is missing in production", () => {
  const source = read("lib/db/repository.ts");

  assert.match(source, /favedSeq/);
  assert.match(source, /INFORMATION_SCHEMA.COLUMNS|PRAGMA table_info/);
});

test("admin logs expose a structured JSON export path", () => {
  const pageSource = read("app/admin/logs/page.tsx");
  const routeSource = read("app/api/logs/route.ts");

  assert.match(pageSource, /Export JSON/);
  assert.match(pageSource, /format/);
  assert.match(routeSource, /Content-Disposition/);
  assert.match(routeSource, /application\/json/);
});





