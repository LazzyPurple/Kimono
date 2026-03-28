import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  purgeRebuildableDataOnStartup,
  REBUILDABLE_DB_TABLES,
  PRESERVED_DB_TABLES,
} = require("../lib/server/startup-db-maintenance.cjs");

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("startup DB maintenance preserves creator catalog tables while purging rebuildable caches", async () => {
  const executedSql = [];
  const resetDirs = [];

  const summary = await purgeRebuildableDataOnStartup({
    env: {
      DATABASE_URL: "mysql://user:pass@localhost:3306/kimono",
      PREVIEW_ASSET_DIR: "tmp/custom-preview-assets",
      MEDIA_SOURCE_CACHE_DIR: "tmp/custom-media-source-cache",
    },
    executeSql: async (sql) => {
      executedSql.push(sql);
    },
    resetDirectory: async (directoryPath) => {
      resetDirs.push(directoryPath);
    },
    workspaceRoot: root,
    logger: { info() {}, warn() {} },
  });

  assert.equal(REBUILDABLE_DB_TABLES.includes("CreatorIndex"), false);
  assert.equal(REBUILDABLE_DB_TABLES.includes("CreatorsCache"), false);
  assert.equal(PRESERVED_DB_TABLES.includes("CreatorIndex"), true);
  assert.equal(PRESERVED_DB_TABLES.includes("CreatorsCache"), true);
  assert.deepEqual(summary.tablesPurged, REBUILDABLE_DB_TABLES);
  assert.deepEqual(summary.directoriesReset, [
    path.resolve(root, "tmp/custom-preview-assets"),
    path.resolve(root, "tmp/custom-media-source-cache"),
  ]);

  for (const table of REBUILDABLE_DB_TABLES) {
    assert.equal(
      executedSql.some((sql) => sql.includes(`DELETE FROM \`${table}\``)),
      true,
      `${table} should be purged on startup`
    );
  }

  for (const table of PRESERVED_DB_TABLES) {
    assert.equal(
      executedSql.some((sql) => sql.includes(`DELETE FROM \`${table}\``)),
      false,
      `${table} must be preserved during startup purge`
    );
  }

  assert.deepEqual(resetDirs, summary.directoriesReset);
});

test("startup DB maintenance ignores missing tables and cache directories", async () => {
  const executedSql = [];
  const resetDirs = [];

  const summary = await purgeRebuildableDataOnStartup({
    env: {
      DATABASE_URL: "mysql://user:pass@localhost:3306/kimono",
    },
    executeSql: async (sql) => {
      executedSql.push(sql);
      if (sql.includes("MediaSourceCache")) {
        const error = new Error("missing table");
        error.code = "ER_NO_SUCH_TABLE";
        throw error;
      }
    },
    resetDirectory: async (directoryPath) => {
      resetDirs.push(directoryPath);
      if (directoryPath.endsWith(path.join("tmp", "preview-assets"))) {
        const error = new Error("missing dir");
        error.code = "ENOENT";
        throw error;
      }
    },
    workspaceRoot: root,
    logger: { info() {}, warn() {} },
  });

  assert.equal(summary.tablesPurged.includes("PostCache"), true);
  assert.equal(summary.tablesPurged.includes("MediaSourceCache"), false);
  assert.equal(summary.directoriesReset.includes(path.resolve(root, "tmp", "media-source-cache")), true);
  assert.equal(resetDirs.length >= 1, true);
});

test("startup DB maintenance fails fast on unexpected SQL errors", async () => {
  await assert.rejects(
    purgeRebuildableDataOnStartup({
      env: {
        DATABASE_URL: "mysql://user:pass@localhost:3306/kimono",
      },
      executeSql: async (sql) => {
        if (sql.includes("PostCache")) {
          throw new Error("boom");
        }
      },
      resetDirectory: async () => {},
      workspaceRoot: root,
      logger: { info() {}, warn() {} },
    }),
    /boom/
  );
});

test("server startup runs creator sync at boot and no longer auto-purges rebuildable DB state", () => {
  const source = read("server.js");

  assert.match(source, /runCreatorSync/);
  assert.match(source, /scheduleCreatorSyncRefresh/);
  assert.doesNotMatch(source, /purgeRebuildableDataOnStartup/);
  assert.doesNotMatch(source, /startup rebuildable data purge complete/);
  assert.match(source, /startup creator index warm complete/);
  assert.match(source, /startup creator index warm failed/);
  assert.match(source, /continuing without blocking boot/);
  assert.match(source, /startup creator index refresh schedule initialized/);
  assert.match(source, /void\s+\(async/);
  assert.equal(source.includes("createServer("), true);
});



