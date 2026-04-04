const { createPostgresRuntimeClient } = require("./postgres-runtime.cjs");

const SITE_BASE_URLS = {
  kemono: "https://kemono.cr",
  coomer: "https://coomer.st",
};

const CREATOR_SYNC_SITES = Object.keys(SITE_BASE_URLS);
const CREATOR_INDEX_FRESHNESS_TTL_MS = 36 * 60 * 60 * 1000;
const CREATOR_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LARGE_PAYLOAD_TIMEOUT_MS = 180000;
const UPSERT_BATCH_SIZE = 500;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function parseDatabaseDriver(databaseUrl) {
  const normalized = String(databaseUrl || "").toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("postgres://") || normalized.startsWith("postgresql://")) return "postgres";
  return "unknown";
}

function normalizeCreatorName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createUpstreamBrowserHeaders(site, cookie) {
  const headers = {
    Accept: "text/css",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": BROWSER_USER_AGENT,
    Referer: `${SITE_BASE_URLS[site]}/`,
  };

  if (cookie && String(cookie).trim()) {
    headers.Cookie = String(cookie).trim();
  }

  return headers;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isSnapshotFresh(syncedAt, now) {
  if (!(syncedAt instanceof Date) || Number.isNaN(syncedAt.getTime())) {
    return false;
  }
  return now.getTime() - syncedAt.getTime() < CREATOR_INDEX_FRESHNESS_TTL_MS;
}

async function fetchCreatorCatalog(site, cookie, timeoutMs = LARGE_PAYLOAD_TIMEOUT_MS) {
  const baseUrl = SITE_BASE_URLS[site];
  if (!baseUrl) {
    throw new Error(`Unsupported creator sync site: ${site}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/v1/creators`, {
      headers: createUpstreamBrowserHeaders(site, cookie),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`Creator sync upstream failed for ${site} with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(`Creator sync returned a non-array payload for ${site}`);
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toCreatorRows(site, creators, syncedAt) {
  return creators
    .filter((creator) => creator && creator.id && creator.service && creator.name)
    .map((creator) => ({
      site,
      service: String(creator.service),
      creatorId: String(creator.id),
      name: String(creator.name),
      normalizedName: normalizeCreatorName(creator.name),
      indexed: typeof creator.indexed === "number" ? creator.indexed : null,
      updated: typeof creator.updated === "number" ? creator.updated : null,
      favorited: Number(creator.favorited ?? 0),
      postCount: Number(creator.post_count ?? 0),
      publicId: creator.public_id ?? null,
      relationId: creator.relation_id ?? null,
      dmCount: Number(creator.dm_count ?? 0),
      shareCount: Number(creator.share_count ?? 0),
      hasChats: creator.has_chats ? 1 : 0,
      chatCount: Number(creator.chat_count ?? 0),
      profileImageUrl: null,
      bannerImageUrl: null,
      rawIndexPayload: JSON.stringify(creator),
      catalogSyncedAt: syncedAt,
    }));
}

async function getSiteStatus(connection, site) {
  const rows = await connection.queryRows(
    "SELECT COUNT(*) AS total, MAX(catalogSyncedAt) AS syncedAt FROM Creator WHERE site = ? AND archivedAt IS NULL",
    [site]
  );
  const row = rows[0] ?? null;
  const syncedAt = row?.syncedAt ? new Date(row.syncedAt) : null;
  return {
    total: Number(row?.total ?? 0),
    syncedAt: syncedAt instanceof Date && !Number.isNaN(syncedAt.getTime()) ? syncedAt : null,
  };
}

async function getLatestKimonoSession(connection, site) {
  const rows = await connection.queryRows(
    "SELECT cookie FROM KimonoSession WHERE site = ? ORDER BY savedAt DESC LIMIT 1",
    [site]
  );
  return rows[0] ?? null;
}

async function upsertCreatorBatch(connection, rows) {
  if (!rows.length) {
    return { inserted: 0, updated: 0 };
  }

  const site = rows[0].site;
  const existingRows = await connection.queryRows(
    `SELECT service, creatorId FROM Creator WHERE site = ? AND (${rows.map(() => "(service = ? AND creatorId = ?)").join(" OR ")})`,
    [site, ...rows.flatMap((row) => [row.service, row.creatorId])]
  );

  const updated = Array.isArray(existingRows) ? existingRows.length : 0;
  const inserted = Math.max(0, rows.length - updated);
  const valuesSql = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = rows.flatMap((row) => [
    row.site,
    row.service,
    row.creatorId,
    row.name,
    row.normalizedName,
    row.indexed,
    row.updated,
    row.favorited,
    row.postCount,
    row.publicId,
    row.relationId,
    row.dmCount,
    row.shareCount,
    row.hasChats,
    row.chatCount,
    row.profileImageUrl,
    row.bannerImageUrl,
    row.rawIndexPayload,
    row.catalogSyncedAt,
    null,
  ]);

  await connection.executeResult(
    `INSERT INTO Creator (site, service, creatorId, name, normalizedName, indexed, updated, favorited, postCount, publicId, relationId, dmCount, shareCount, hasChats, chatCount, profileImageUrl, bannerImageUrl, rawIndexPayload, catalogSyncedAt, archivedAt) VALUES ${valuesSql}
     ON CONFLICT (site, service, creatorId) DO UPDATE SET
       name = EXCLUDED.name,
       normalizedName = EXCLUDED.normalizedName,
       indexed = EXCLUDED.indexed,
       updated = EXCLUDED.updated,
       favorited = EXCLUDED.favorited,
       postCount = EXCLUDED.postCount,
       publicId = EXCLUDED.publicId,
       relationId = EXCLUDED.relationId,
       dmCount = EXCLUDED.dmCount,
       shareCount = EXCLUDED.shareCount,
       hasChats = EXCLUDED.hasChats,
       chatCount = EXCLUDED.chatCount,
       profileImageUrl = COALESCE(EXCLUDED.profileImageUrl, Creator.profileImageUrl),
       bannerImageUrl = COALESCE(EXCLUDED.bannerImageUrl, Creator.bannerImageUrl),
       rawIndexPayload = EXCLUDED.rawIndexPayload,
       catalogSyncedAt = EXCLUDED.catalogSyncedAt,
       archivedAt = NULL`,
    values
  );

  return { inserted, updated };
}

async function archiveStaleCreators(connection, site, activeIds) {
  if (!activeIds.length) {
    return connection.executeResult("UPDATE Creator SET archivedAt = NOW(3) WHERE site = ? AND archivedAt IS NULL", [site]);
  }

  return connection.executeResult(
    `UPDATE Creator SET archivedAt = NOW(3) WHERE site = ? AND archivedAt IS NULL AND NOT (${activeIds.map(() => "(service = ? AND creatorId = ?)").join(" OR ")})`,
    [site, ...activeIds.flatMap((entry) => [entry.service, entry.creatorId])]
  );
}

async function runCreatorSync(options = {}) {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const force = Boolean(options.force);
  const sites = Array.isArray(options.sites) && options.sites.length > 0 ? options.sites : CREATOR_SYNC_SITES;
  const driver = parseDatabaseDriver(env.DATABASE_URL);

  if (driver !== "postgres") {
    logger.info?.(`[BOOT] Creator sync skipped (driver=${driver ?? "none"}).`);
    return {
      skipped: true,
      driver,
      refreshedSites: [],
      reusedSites: [],
      failedSites: [],
    };
  }

  const summary = {
    skipped: false,
    driver,
    refreshedSites: [],
    reusedSites: [],
    failedSites: [],
  };

  const connection = createPostgresRuntimeClient(env.DATABASE_URL);
  try {
    for (const site of sites) {
      const now = new Date();
      const status = await getSiteStatus(connection, site);
      const fresh = status.total > 0 && isSnapshotFresh(status.syncedAt, now);

      if (!force && fresh) {
        summary.reusedSites.push({ site, total: status.total, syncedAt: status.syncedAt, stale: false });
        continue;
      }

      const hadUsableSnapshot = status.total > 0 && Boolean(status.syncedAt);
      try {
        const session = await getLatestKimonoSession(connection, site);
        const payload = await fetchCreatorCatalog(site, session?.cookie ?? null);
        const rows = toCreatorRows(site, payload, now);
        let inserted = 0;
        let updated = 0;
        for (const batch of chunkArray(rows, UPSERT_BATCH_SIZE)) {
          const result = await upsertCreatorBatch(connection, batch);
          inserted += result.inserted;
          updated += result.updated;
        }
        const archived = await archiveStaleCreators(connection, site, rows.map((row) => ({ service: row.service, creatorId: row.creatorId })));
        summary.refreshedSites.push({ site, total: rows.length, syncedAt: now, stale: hadUsableSnapshot, inserted, updated, archived });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = typeof error === "object" && error && typeof error.status === "number" ? error.status : null;
        summary.failedSites.push({ site, stale: hadUsableSnapshot, error: message, status: statusCode });
        if (statusCode === 403) {
          logger.warn?.(`[BOOT] Creator sync received HTTP 403 for ${site}; keeping existing Creator rows untouched.`);
        }
        if (hadUsableSnapshot) {
          summary.reusedSites.push({ site, total: status.total, syncedAt: status.syncedAt, stale: true });
          logger.warn?.(`[BOOT] Creator sync failed for ${site}; keeping stale snapshot (${message}).`);
          continue;
        }
        throw error;
      }
    }

    logger.info?.(`[BOOT] Creator sync complete: refreshed=${summary.refreshedSites.length}, reused=${summary.reusedSites.length}, failed=${summary.failedSites.length}`);
    return summary;
  } finally {
    await connection.close();
  }
}

function scheduleCreatorSyncRefresh({ env = process.env, logger = console, intervalMs = CREATOR_SYNC_INTERVAL_MS } = {}) {
  const driver = parseDatabaseDriver(env.DATABASE_URL);
  if (driver !== "postgres") {
    return { skipped: true, driver, intervalMs };
  }

  const timer = setInterval(() => {
    void runCreatorSync({ env, logger, force: false }).catch((error) => {
      logger.error?.("[BOOT] Creator sync refresh failed", error);
    });
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return { skipped: false, driver, intervalMs };
}

module.exports = {
  runCreatorSync,
  scheduleCreatorSyncRefresh,
};

