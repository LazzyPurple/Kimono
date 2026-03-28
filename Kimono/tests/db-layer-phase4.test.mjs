import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const REPOSITORY_EXPORTS = [
  "searchCreators",
  "getCreatorById",
  "upsertCreators",
  "archiveStaleCreators",
  "updateCreatorProfile",
  "isCreatorCatalogFresh",
  "getPostById",
  "getCreatorPosts",
  "upsertPost",
  "upsertPosts",
  "getPopularPosts",
  "deleteExpiredPosts",
  "getMediaAsset",
  "upsertMediaAsset",
  "updateMediaAssetStatus",
  "deleteStaleMediaAssets",
  "getMediaSource",
  "upsertMediaSource",
  "updateMediaSourceDownload",
  "deleteExpiredMediaSources",
  "getFavoriteChronology",
  "upsertFavoriteChronologyEntry",
  "deleteFavoriteChronologyEntry",
  "getFavoriteCache",
  "upsertFavoriteCache",
  "getDiscoveryCache",
  "upsertDiscoveryCache",
  "getDiscoveryBlocks",
  "upsertDiscoveryBlock",
  "deleteDiscoveryBlock",
  "getLatestKimonoSession",
  "upsertKimonoSession",
  "deleteKimonoSession",
];

test("Phase 4 TTL config matches the central contract", async () => {
  const { TTL } = await import("../lib/config/ttl.ts");

  assert.equal(TTL.creator.index, 36 * 60 * 60 * 1000);
  assert.equal(TTL.creator.syncInterval, 24 * 60 * 60 * 1000);
  assert.equal(TTL.creator.profile, 36 * 60 * 60 * 1000);
  assert.equal(TTL.post.standard, 1 * 60 * 60 * 1000);
  assert.equal(TTL.post.popular, 18 * 60 * 60 * 1000);
  assert.equal(TTL.post.stale, 7 * 24 * 60 * 60 * 1000);
  assert.equal(TTL.media.preview, 7 * 24 * 60 * 60 * 1000);
  assert.equal(TTL.media.popular, 72 * 60 * 60 * 1000);
  assert.equal(TTL.media.liked, 14 * 24 * 60 * 60 * 1000);
  assert.equal(TTL.media.playback, 24 * 60 * 60 * 1000);
  assert.equal(TTL.favorites.fresh, 45 * 1000);
  assert.equal(TTL.favorites.stale, 10 * 60 * 1000);
  assert.equal(TTL.favorites.cache, 7 * 24 * 60 * 60 * 1000);
  assert.equal(TTL.discover.cache, 12 * 60 * 60 * 1000);
  assert.equal(TTL.upstream.defaultTimeout, 15 * 1000);
  assert.equal(TTL.upstream.largePayloadTimeout, 180 * 1000);
  assert.ok(!Object.prototype.hasOwnProperty.call(TTL, "search"));
});

test("Phase 4 db types file matches the validated contract names", () => {
  const source = read("lib/db/types.ts");

  for (const symbol of [
    "KimonoSite",
    "KimonoService",
    "PostDetailLevel",
    "PostSourceKind",
    "MediaKind",
    "MediaPriorityClass",
    "FavoriteKind",
    "CreatorRow",
    "InsertCreatorRow",
    "PostRow",
    "MediaAssetRow",
    "MediaSourceRow",
    "FavoriteChronologyRow",
    "FavoriteCacheRow",
    "DiscoveryCacheRow",
    "DiscoveryBlockRow",
    "KimonoSessionRow",
    "SearchCreatorsOpts",
    "SearchCreatorsResult",
  ]) {
    assert.match(source, new RegExp(`export (?:interface|type) ${symbol}\\b`), `types file should export ${symbol}`);
  }

  assert.doesNotMatch(source, /CreatorSearchCache/i);
  assert.match(source, /indexed:\s*number \| null/i, "CreatorRow should use indexed unix timestamps");
  assert.match(source, /updated:\s*number \| null/i, "CreatorRow should use updated unix timestamps");
});

test("Phase 4 repositories expose the validated function surface", async () => {
  const repository = await import("../lib/db/repository.ts");
  const localRepository = await import("../lib/db/local-repository.ts");

  for (const exportName of REPOSITORY_EXPORTS) {
    assert.equal(typeof repository[exportName], "function", `repository.ts should export ${exportName}`);
    assert.equal(typeof localRepository[exportName], "function", `local-repository.ts should export ${exportName}`);
  }
});

test("Phase 4 db index resolves through the new repository layer only", () => {
  const source = read("lib/db/index.ts");

  assert.match(source, /repository\.ts/);
  assert.match(source, /local-repository\.ts/);
  assert.doesNotMatch(source, /data-store\.ts/);
  assert.doesNotMatch(source, /perf-repository\.ts/);
});

test("Phase 4 creator sync job uses the centralized timeout, discover bucket guard and 500-row batches", () => {
  const source = read("lib/jobs/creator-sync.ts");
  const helperSource = read("lib/api/upstream-browser-headers.ts");

  assert.match(source, /export async function runCreatorSync/);
  assert.match(source, /TTL\.upstream\.largePayloadTimeout/);
  assert.match(source, /createUpstreamBrowserHeaders/);
  assert.match(source, /getLatestKimonoSession/);
  assert.match(source, /canRequest\([^\n]+discover/);
  assert.match(source, /INSERT_BATCH_SIZE\s*=\s*500/);
  assert.equal(helperSource.includes('Accept: "text/css"'), true);
  assert.doesNotMatch(source, /CreatorSearchCache/);
});
