const fs = require("fs");
const path = require("path");
const { createPostgresRuntimeClient } = require("./postgres-runtime.cjs");

const DEFAULT_PREVIEW_ASSET_DIR = path.join("tmp", "preview-assets");
const DEFAULT_MEDIA_SOURCE_CACHE_DIR = path.join("tmp", "media-source-cache");

const REBUILDABLE_DB_TABLES = [
  "DiscoveryCache",
  "DiscoveryBlock",
  "Post",
  "MediaAsset",
  "MediaSource",
  "FavoriteCache",
];

const PRESERVED_DB_TABLES = [
  "User",
  "Passkey",
  "Session",
  "KimonoSession",
  "FavoriteChronology",
  "Creator",
];

function parseDatabaseDriver(databaseUrl) {
  const normalized = String(databaseUrl || "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("postgres://") || normalized.startsWith("postgresql://")) {
    return "postgres";
  }
  return "unknown";
}

function resolveConfiguredDirectory(configuredPath, fallbackRelativePath, workspaceRoot) {
  const trimmed = typeof configuredPath === "string" ? configuredPath.trim() : "";
  if (!trimmed) {
    return path.resolve(workspaceRoot, fallbackRelativePath);
  }

  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(workspaceRoot, trimmed);
}

function isIgnorableSqlError(error) {
  const code = error && typeof error === "object" ? error.code : null;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "ER_NO_SUCH_TABLE"
    || code === "42S02"
    || code === "42P01"
    || message.includes("no such table");
}

function isIgnorableFilesystemError(error) {
  const code = error && typeof error === "object" ? error.code : null;
  return code === "ENOENT";
}

async function resetDirectoryContents(directoryPath, fileSystem = fs.promises) {
  await fileSystem.rm(directoryPath, { recursive: true, force: true });
  await fileSystem.mkdir(directoryPath, { recursive: true });
}

async function createPostgresExecutor(databaseUrl) {
  const connection = createPostgresRuntimeClient(databaseUrl);
  return {
    executeSql: async (sql) => {
      await connection.executeResult(sql);
    },
    close: async () => {
      await connection.close();
    },
  };
}

async function purgeRebuildableDataOnStartup({
  env = process.env,
  workspaceRoot = process.cwd(),
  logger = console,
  executeSql,
  closeSqlConnection,
  resetDirectory = resetDirectoryContents,
} = {}) {
  const databaseDriver = parseDatabaseDriver(env.DATABASE_URL);
  if (databaseDriver !== "postgres") {
    logger.info?.(`[BOOT] Startup rebuildable data purge skipped (driver=${databaseDriver ?? "none"}).`);
    return {
      skipped: true,
      driver: databaseDriver,
      tablesPurged: [],
      directoriesReset: [],
    };
  }

  let localExecuteSql = executeSql;
  let localClose = closeSqlConnection;
  if (!localExecuteSql) {
    const executor = await createPostgresExecutor(env.DATABASE_URL);
    localExecuteSql = executor.executeSql;
    localClose = executor.close;
  }

  const tablesPurged = [];
  const directoriesReset = [];
  const directoriesToReset = [
    resolveConfiguredDirectory(env.PREVIEW_ASSET_DIR, DEFAULT_PREVIEW_ASSET_DIR, workspaceRoot),
    resolveConfiguredDirectory(env.MEDIA_SOURCE_CACHE_DIR, DEFAULT_MEDIA_SOURCE_CACHE_DIR, workspaceRoot),
  ];

  try {
    for (const table of REBUILDABLE_DB_TABLES) {
      try {
        await localExecuteSql(`DELETE FROM \`${table}\``);
        tablesPurged.push(table);
      } catch (error) {
        if (isIgnorableSqlError(error)) {
          logger.warn?.(`[BOOT] Startup purge skipped missing table ${table}.`);
          continue;
        }
        throw error;
      }
    }

    for (const directoryPath of directoriesToReset) {
      try {
        await resetDirectory(directoryPath);
        directoriesReset.push(directoryPath);
      } catch (error) {
        if (isIgnorableFilesystemError(error)) {
          logger.warn?.(`[BOOT] Startup purge skipped missing cache dir ${directoryPath}.`);
          continue;
        }
        throw error;
      }
    }

    logger.info?.(`[BOOT] Startup rebuildable data purge complete: tables=${tablesPurged.length}, dirs=${directoriesReset.length}`);

    return {
      skipped: false,
      driver: databaseDriver,
      tablesPurged,
      directoriesReset,
    };
  } finally {
    await localClose?.();
  }
}

module.exports = {
  PRESERVED_DB_TABLES,
  REBUILDABLE_DB_TABLES,
  purgeRebuildableDataOnStartup,
  resetDirectoryContents,
};
