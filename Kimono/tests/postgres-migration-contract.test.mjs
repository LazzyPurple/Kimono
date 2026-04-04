import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("runtime db layer no longer depends on mysql2", () => {
  const dbModule = read("lib/db.ts");
  const dbIndexModule = read("lib/db/index.ts");
  const authStoreModule = read("lib/db/auth-store.ts");

  assert.doesNotMatch(dbModule, /mysql2\/promise/);
  assert.doesNotMatch(dbIndexModule, /mysql2\/promise/);
  assert.doesNotMatch(authStoreModule, /mysql2\/promise/);
});

test("repository no longer contains MySQL-only upsert or schema inspection syntax", () => {
  const repositoryModule = read("lib/db/repository.ts");

  assert.doesNotMatch(repositoryModule, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(repositoryModule, /DATABASE\(\)/);
  assert.doesNotMatch(repositoryModule, /INFORMATION_SCHEMA\.COLUMNS WHERE TABLE_SCHEMA = DATABASE\(\)/);
  assert.doesNotMatch(repositoryModule, /PRAGMA table_info/);
});

test("startup runtime no longer creates mysql2 connections directly", () => {
  const creatorSyncRuntimeModule = read("lib/server/creator-sync-runtime.cjs");
  const startupMaintenanceModule = read("lib/server/startup-db-maintenance.cjs");
  const startupModule = read("lib/server/startup.cjs");

  assert.doesNotMatch(creatorSyncRuntimeModule, /mysql2\/promise/);
  assert.doesNotMatch(startupMaintenanceModule, /mysql2\/promise/);
  assert.doesNotMatch(creatorSyncRuntimeModule, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(creatorSyncRuntimeModule, /mysql:\/\//);
  assert.doesNotMatch(startupMaintenanceModule, /mysql:\/\//);
  assert.doesNotMatch(startupModule, /mysql:\/\//);
});

test("postgres migration removes legacy MySQL init scaffolding and health/docs mismatches", () => {
  const healthPageModule = read("app/(main)/health/page.tsx");
  const deployGuide = read("DEPLOY.md");
  const bootstrapSql = read("deploy/o2switch-init.sql");
  const reconstructionSql = read("deploy/migrations/v2-reconstruction.sql");
  const cleanupSql = read("deploy/migrations/v2-cleanup-legacy-tables.sql");

  assert.equal(fs.existsSync(path.join(root, "lib/db-init.ts")), false);
  assert.equal(fs.existsSync(path.join(root, "lib/run-init.ts")), false);
  assert.match(healthPageModule, /driver === "postgres"/);
  assert.doesNotMatch(deployGuide, /mysql:\/\//i);
  assert.doesNotMatch(deployGuide, /runtime MySQL/i);
  assert.doesNotMatch(bootstrapSql, /ENGINE=InnoDB|CHARSET=utf8mb4|FOREIGN_KEY_CHECKS/i);
  assert.doesNotMatch(reconstructionSql, /ENGINE=InnoDB|CHARSET=utf8mb4|FOREIGN_KEY_CHECKS/i);
  assert.match(reconstructionSql, /PostgreSQL/i);
  assert.doesNotMatch(cleanupSql, /FOREIGN_KEY_CHECKS/i);
  assert.match(cleanupSql, /PostgreSQL/i);
});
