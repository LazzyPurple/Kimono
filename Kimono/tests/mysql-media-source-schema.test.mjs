import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const TARGET_TABLES = [
  "KimonoSession",
  "Creator",
  "Post",
  "FavoriteChronology",
  "FavoriteCache",
  "MediaAsset",
  "MediaSource",
  "DiscoveryCache",
  "DiscoveryBlock",
];

const LEGACY_TABLES = [
  "CreatorsCache",
  "CreatorIndex",
  "PostCache",
  "PopularSnapshot",
  "CreatorSnapshot",
  "CreatorSearchCache",
  "FavoriteSnapshot",
  "PreviewAssetCache",
  "MediaSourceCache",
];

function expectCreates(source, tableName, label) {
  const pattern = new RegExp(`CREATE TABLE\\s+IF NOT EXISTS\\s+` + "`?" + tableName + "`?", "i");
  assert.match(source, pattern, `${label} should create ${tableName}`);
}

function expectNoCreates(source, tableName, label) {
  const pattern = new RegExp(`CREATE TABLE\\s+IF NOT EXISTS\\s+` + "`?" + tableName + "`?", "i");
  assert.doesNotMatch(source, pattern, `${label} should not create legacy table ${tableName}`);
}

test("Phase 3 bootstrap SQL matches the reconstructed schema", () => {
  const deploySql = readWorkspaceFile("deploy/o2switch-init.sql");

  for (const tableName of TARGET_TABLES) {
    expectCreates(deploySql, tableName, "deploy/o2switch-init.sql");
  }

  for (const tableName of LEGACY_TABLES) {
    expectNoCreates(deploySql, tableName, "deploy/o2switch-init.sql");
  }
});

test("Phase 3 migration exists, preserves auth tables, and drops legacy content tables", () => {
  const migrationSql = readWorkspaceFile("deploy/migrations/v2-reconstruction.sql");

  for (const tableName of TARGET_TABLES) {
    expectCreates(migrationSql, tableName, "deploy/migrations/v2-reconstruction.sql");
  }

  for (const tableName of ["User", "Passkey", "Session"]) {
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`DROP TABLE IF EXISTS\\s+` + "`?" + tableName + "`?", "i"),
      `migration should never drop preserved auth table ${tableName}`,
    );
  }

  for (const tableName of [
    "CreatorsCache",
    "CreatorIndex",
    "PostCache",
    "PopularSnapshot",
    "CreatorSearchCache",
    "FavoriteSnapshot",
    "PreviewAssetCache",
    "MediaSourceCache",
    "DiscoveryCache",
    "DiscoveryBlock",
    "KimonoSession",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`DROP TABLE IF EXISTS\\s+` + "`?" + tableName + "`?", "i"),
      `migration should drop legacy table ${tableName}`,
    );
  }
});

test("Prisma dev schema mirrors reconstructed content tables", () => {
  const prismaSchema = readWorkspaceFile("prisma/schema.prisma");

  for (const tableName of [...TARGET_TABLES, "User", "Passkey", "Session"]) {
    assert.match(prismaSchema, new RegExp(`model\\s+${tableName}\\s+\\{`), `prisma schema should declare model ${tableName}`);
  }

  for (const tableName of LEGACY_TABLES) {
    assert.doesNotMatch(prismaSchema, new RegExp(`model\\s+${tableName}\\s+\\{`), `prisma schema should not declare legacy model ${tableName}`);
  }
});

test("legacy cleanup migration removes survivor tables from older prod installs", () => {
  const cleanupSql = readWorkspaceFile("deploy/migrations/v2-cleanup-legacy-tables.sql");

  for (const tableName of [
    "CreatorIndex",
    "CreatorsCache",
    "CreatorSearchCache",
    "CreatorSnapshot",
    "PopularSnapshot",
    "PreviewAssetCache",
    "MediaSourceCache",
    "FavoriteSnapshot",
  ]) {
    assert.match(
      cleanupSql,
      new RegExp(`DROP TABLE IF EXISTS\\s+` + "`?" + tableName + "`?", "i"),
      `cleanup migration should drop legacy table ${tableName}`,
    );
  }
});
