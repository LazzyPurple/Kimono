import type { DbConnection } from "../db.ts";

import { logAppError } from "../app-logger.ts";
import { TTL } from "../config/ttl.ts";
import type {
  CreatorRow,
  DiscoveryBlockRow,
  DiscoveryCacheRow,
  FavoriteCacheRow,
  FavoriteChronologyRow,
  FavoriteKind,
  InsertCreatorRow,
  KimonoSessionRow,
  KimonoSite,
  MediaAssetRow,
  MediaSourceRow,
  PostRow,
  SearchCreatorsOpts,
  SearchCreatorsResult,
} from "./types.ts";

type QueryableConnection = Pick<DbConnection, "query" | "execute">;
type RowShape = Record<string, unknown>;

const CREATOR_UPSERT_BATCH_SIZE = 500;
const columnPresenceCache = new Map<string, boolean>();

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "1" || normalized === "true";
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function queryRows<T extends RowShape = RowShape>(conn: QueryableConnection, sql: string, values: unknown[] = []): Promise<T[]> {
  const [rows] = await conn.query(sql, values as any[]);
  return rows as T[];
}

async function executeResult(conn: QueryableConnection, sql: string, values: unknown[] = []): Promise<number> {
  const [result] = await conn.execute(sql, values as any[]);
  return typeof (result as { affectedRows?: unknown })?.affectedRows === "number"
    ? Number((result as { affectedRows: number }).affectedRows)
    : 0;
}

async function hasColumn(conn: QueryableConnection, tableName: string, columnName: string): Promise<boolean> {
  const cacheKey = `postgres:${tableName}:${columnName}`;
  const cached = columnPresenceCache.get(cacheKey);
  if (typeof cached === "boolean") {
    return cached;
  }

  try {
    const rows = await queryRows<{ total?: unknown }>(
      conn,
      "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = LOWER(?) AND column_name = LOWER(?)",
      [tableName, columnName],
    );
    const present = Number(rows[0]?.total ?? 0) > 0;

    columnPresenceCache.set(cacheKey, present);
    return present;
  } catch {
    columnPresenceCache.set(cacheKey, false);
    return false;
  }
}

async function hasFavoriteChronologyFavedSeq(conn: QueryableConnection): Promise<boolean> {
  return hasColumn(conn, "FavoriteChronology", "favedSeq");
}

async function withDbLog<T>(operation: string, details: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await logAppError("db-repository", `DB operation failed: ${operation}`, error, { details });
    throw error;
  }
}

function mapCreatorRow(row: RowShape): CreatorRow {
  return {
    site: String(row.site) as KimonoSite,
    service: String(row.service),
    creatorId: String(row.creatorId),
    name: String(row.name),
    normalizedName: String(row.normalizedName),
    indexed: typeof row.indexed === "number" ? row.indexed : row.indexed != null ? Number(row.indexed) : null,
    updated: typeof row.updated === "number" ? row.updated : row.updated != null ? Number(row.updated) : null,
    favorited: toNumber(row.favorited) ?? 0,
    postCount: toNumber(row.postCount) ?? 0,
    publicId: row.publicId ? String(row.publicId) : null,
    relationId: toNumber(row.relationId),
    dmCount: toNumber(row.dmCount) ?? 0,
    shareCount: toNumber(row.shareCount) ?? 0,
    hasChats: toBoolean(row.hasChats),
    chatCount: toNumber(row.chatCount) ?? 0,
    profileImageUrl: row.profileImageUrl ? String(row.profileImageUrl) : null,
    bannerImageUrl: row.bannerImageUrl ? String(row.bannerImageUrl) : null,
    rawIndexPayload: row.rawIndexPayload ? String(row.rawIndexPayload) : null,
    rawProfilePayload: row.rawProfilePayload ? String(row.rawProfilePayload) : null,
    catalogSyncedAt: toDate(row.catalogSyncedAt) ?? new Date(0),
    profileCachedAt: toDate(row.profileCachedAt),
    profileExpiresAt: toDate(row.profileExpiresAt),
    archivedAt: toDate(row.archivedAt),
  };
}

function mapPostRow(row: RowShape): PostRow {
  return {
    site: String(row.site) as KimonoSite,
    service: String(row.service),
    creatorId: String(row.creatorId),
    postId: String(row.postId),
    title: row.title ? String(row.title) : null,
    contentHtml: row.contentHtml ? String(row.contentHtml) : null,
    excerpt: row.excerpt ? String(row.excerpt) : null,
    publishedAt: toDate(row.publishedAt),
    addedAt: toDate(row.addedAt),
    editedAt: toDate(row.editedAt),
    fileName: row.fileName ? String(row.fileName) : null,
    filePath: row.filePath ? String(row.filePath) : null,
    attachmentsJson: row.attachmentsJson ? String(row.attachmentsJson) : null,
    embedJson: row.embedJson ? String(row.embedJson) : null,
    tagsJson: row.tagsJson ? String(row.tagsJson) : null,
    prevPostId: row.prevPostId ? String(row.prevPostId) : null,
    nextPostId: row.nextPostId ? String(row.nextPostId) : null,
    favCount: toNumber(row.favCount) ?? 0,
    previewImageUrl: row.previewImageUrl ? String(row.previewImageUrl) : null,
    videoUrl: row.videoUrl ? String(row.videoUrl) : null,
    thumbUrl: row.thumbUrl ? String(row.thumbUrl) : null,
    mediaType: row.mediaType ? String(row.mediaType) : null,
    authorName: row.authorName ? String(row.authorName) : null,
    rawPreviewPayload: row.rawPreviewPayload ? String(row.rawPreviewPayload) : null,
    rawDetailPayload: row.rawDetailPayload ? String(row.rawDetailPayload) : null,
    detailLevel: String(row.detailLevel ?? "preview") as PostRow["detailLevel"],
    sourceKind: String(row.sourceKind ?? "upstream") as PostRow["sourceKind"],
    isPopular: toBoolean(row.isPopular),
    primaryPopularPeriod: row.primaryPopularPeriod ? String(row.primaryPopularPeriod) as PostRow["primaryPopularPeriod"] : null,
    primaryPopularDate: row.primaryPopularDate ? String(row.primaryPopularDate) : null,
    primaryPopularOffset: toNumber(row.primaryPopularOffset),
    primaryPopularRank: toNumber(row.primaryPopularRank),
    popularContextsJson: row.popularContextsJson ? String(row.popularContextsJson) : null,
    longestVideoUrl: row.longestVideoUrl ? String(row.longestVideoUrl) : null,
    longestVideoDurationSeconds: toNumber(row.longestVideoDurationSeconds),
    previewStatus: row.previewStatus ? String(row.previewStatus) : null,
    nativeThumbnailUrl: row.nativeThumbnailUrl ? String(row.nativeThumbnailUrl) : null,
    previewThumbnailAssetPath: row.previewThumbnailAssetPath ? String(row.previewThumbnailAssetPath) : null,
    previewClipAssetPath: row.previewClipAssetPath ? String(row.previewClipAssetPath) : null,
    previewGeneratedAt: toDate(row.previewGeneratedAt),
    previewError: row.previewError ? String(row.previewError) : null,
    previewSourceFingerprint: row.previewSourceFingerprint ? String(row.previewSourceFingerprint) : null,
    mediaMimeType: row.mediaMimeType ? String(row.mediaMimeType) : null,
    mediaWidth: toNumber(row.mediaWidth),
    mediaHeight: toNumber(row.mediaHeight),
    cachedAt: toDate(row.cachedAt) ?? new Date(0),
    expiresAt: toDate(row.expiresAt) ?? new Date(0),
    staleUntil: toDate(row.staleUntil),
    lastSeenAt: toDate(row.lastSeenAt),
  };
}
function mapMediaAssetRow(row: RowShape): MediaAssetRow {
  return {
    site: String(row.site) as KimonoSite,
    sourceFingerprint: String(row.sourceFingerprint),
    sourceUrl: String(row.sourceUrl ?? ""),
    sourcePath: row.sourcePath ? String(row.sourcePath) : null,
    mediaKind: (row.mediaKind ? String(row.mediaKind) : "unknown") as MediaAssetRow["mediaKind"],
    mimeType: row.mimeType ? String(row.mimeType) : null,
    width: toNumber(row.width),
    height: toNumber(row.height),
    durationSeconds: toNumber(row.durationSeconds),
    nativeThumbnailUrl: row.nativeThumbnailUrl ? String(row.nativeThumbnailUrl) : null,
    thumbnailAssetPath: row.thumbnailAssetPath ? String(row.thumbnailAssetPath) : null,
    clipAssetPath: row.clipAssetPath ? String(row.clipAssetPath) : null,
    probeStatus: row.probeStatus ? String(row.probeStatus) : null,
    previewStatus: row.previewStatus ? String(row.previewStatus) : null,
    firstSeenAt: toDate(row.firstSeenAt) ?? new Date(0),
    lastSeenAt: toDate(row.lastSeenAt) ?? new Date(0),
    hotUntil: toDate(row.hotUntil),
    retryAfter: toDate(row.retryAfter),
    generationAttempts: toNumber(row.generationAttempts) ?? 0,
    lastError: row.lastError ? String(row.lastError) : null,
    lastObservedContext: row.lastObservedContext ? String(row.lastObservedContext) : null,
    cachedAt: toDate(row.cachedAt) ?? new Date(0),
    expiresAt: toDate(row.expiresAt),
  };
}

function mapMediaSourceRow(row: RowShape): MediaSourceRow {
  return {
    site: String(row.site) as KimonoSite,
    sourceFingerprint: String(row.sourceFingerprint),
    sourceUrl: String(row.sourceUrl ?? ""),
    sourcePath: row.sourcePath ? String(row.sourcePath) : null,
    localPath: row.localPath ? String(row.localPath) : null,
    downloadStatus: String(row.downloadStatus ?? "pending"),
    downloadedAt: toDate(row.downloadedAt),
    lastSeenAt: toDate(row.lastSeenAt) ?? new Date(0),
    retentionUntil: toDate(row.retentionUntil),
    fileSizeBytes: toNumber(row.fileSizeBytes),
    mimeType: row.mimeType ? String(row.mimeType) : null,
    downloadError: row.downloadError ? String(row.downloadError) : null,
    downloadAttempts: toNumber(row.downloadAttempts) ?? 0,
    lastObservedContext: row.lastObservedContext ? String(row.lastObservedContext) : null,
    priorityClass: row.priorityClass ? String(row.priorityClass) as MediaSourceRow["priorityClass"] : null,
    retryAfter: toDate(row.retryAfter),
    firstSeenAt: toDate(row.firstSeenAt) ?? new Date(0),
  };
}

function mapFavoriteChronologyRow(row: RowShape): FavoriteChronologyRow {
  return {
    kind: String(row.kind) as FavoriteKind,
    site: String(row.site) as KimonoSite,
    service: String(row.service),
    creatorId: String(row.creatorId),
    postId: String(row.postId ?? ""),
    favoritedAt: toDate(row.favoritedAt) ?? new Date(0),
    lastConfirmedAt: toDate(row.lastConfirmedAt),
    favedSeq: toNumber(row.favedSeq),
  };
}

function mapFavoriteCacheRow(row: RowShape): FavoriteCacheRow {
  return {
    kind: String(row.kind) as FavoriteKind,
    site: String(row.site) as KimonoSite,
    payloadJson: String(row.payloadJson ?? "[]"),
    updatedAt: toDate(row.updatedAt) ?? new Date(0),
    expiresAt: toDate(row.expiresAt) ?? new Date(0),
  };
}

function mapDiscoveryCacheRow(row: RowShape): DiscoveryCacheRow {
  return {
    site: String(row.site) as DiscoveryCacheRow["site"],
    payloadJson: String(row.payloadJson ?? "[]"),
    updatedAt: toDate(row.updatedAt) ?? new Date(0),
    expiresAt: toDate(row.expiresAt) ?? new Date(0),
  };
}

function mapDiscoveryBlockRow(row: RowShape): DiscoveryBlockRow {
  return {
    site: String(row.site) as KimonoSite,
    service: String(row.service),
    creatorId: String(row.creatorId),
    blockedAt: toDate(row.blockedAt) ?? new Date(0),
  };
}

function mapKimonoSessionRow(row: RowShape): KimonoSessionRow {
  return {
    id: String(row.id),
    site: String(row.site) as KimonoSite,
    cookie: String(row.cookie ?? ""),
    username: String(row.username ?? ""),
    savedAt: toDate(row.savedAt) ?? new Date(0),
  };
}

function buildDynamicUpdate(data: Record<string, unknown>): { sql: string; values: unknown[] } {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  return {
    sql: entries.map(([key]) => `\`${key}\` = ?`).join(", "),
    values: entries.map(([, value]) => value),
  };
}

export async function searchCreators(conn: DbConnection, opts: SearchCreatorsOpts): Promise<SearchCreatorsResult> {
  return withDbLog("searchCreators", opts as Record<string, unknown>, async () => {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const perPage = Math.max(1, Math.min(100, Math.floor(opts.perPage ?? 50)));
    const sort = opts.sort ?? "name";
    const order = opts.order
      ? (opts.order === "asc" ? "ASC" : "DESC")
      : (sort === "name" ? "ASC" : "DESC");
    const sortColumn = sort === "name" ? "normalizedName" : sort === "updated" ? "updated" : "favorited";
    const where: string[] = ["archivedAt IS NULL"];
    const values: unknown[] = [];
    const query = opts.q?.trim() ?? "";
    const vectorSql = "to_tsvector('simple', regexp_replace(coalesce(name, '') || ' ' || coalesce(normalizedName, ''), '[_-]+', ' ', 'g'))";
    if (opts.site) {
      where.push("site = ?");
      values.push(opts.site);
    }
    if (opts.service) {
      where.push("service = ?");
      values.push(opts.service);
    }
    if (query) {
      where.push(`${vectorSql} @@ plainto_tsquery('simple', ?)`);
      values.push(query);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const countRows = await queryRows<{ total: number }>(conn, `SELECT COUNT(*) AS total FROM \`Creator\` ${whereSql}`, values);
    const orderValues = query ? [query, ...values] : [...values];
    const selectSql = query
      ? `SELECT *, ts_rank(${vectorSql}, plainto_tsquery('simple', ?)) AS rank FROM \`Creator\` ${whereSql}`
      : `SELECT * FROM \`Creator\` ${whereSql}`;
    const orderSql = query
      ? sort === "updated"
        ? "rank DESC, updated DESC, normalizedName ASC"
        : sort === "favorited"
          ? "rank DESC, favorited DESC, normalizedName ASC"
          : "rank DESC, normalizedName ASC"
      : `\`${sortColumn}\` ${order}, normalizedName ASC`;

    const rows = await queryRows(
      conn,
      `${selectSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...orderValues, perPage, (page - 1) * perPage],
    );

    const snapshotFresh = opts.site
      ? await isCreatorCatalogFresh(conn, opts.site)
      : (await Promise.all([
          isCreatorCatalogFresh(conn, "kemono"),
          isCreatorCatalogFresh(conn, "coomer"),
        ])).every(Boolean);

    return {
      rows: rows.map((row) => mapCreatorRow(row)),
      total: Number(countRows[0]?.total ?? 0),
      snapshotFresh,
    };
  });
}

export async function getCreatorById(conn: DbConnection, site: KimonoSite, service: string, creatorId: string): Promise<CreatorRow | null> {
  return withDbLog("getCreatorById", { site, service, creatorId }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `Creator` WHERE site = ? AND service = ? AND creatorId = ? LIMIT 1", [site, service, creatorId]);
    return rows[0] ? mapCreatorRow(rows[0]) : null;
  });
}

export async function getCreatorBySiteAndId(conn: DbConnection, site: KimonoSite, creatorId: string): Promise<CreatorRow | null> {
  return withDbLog("getCreatorBySiteAndId", { site, creatorId }, async () => {
    const rows = await queryRows(
      conn,
      "SELECT * FROM `Creator` WHERE site = ? AND creatorId = ? AND archivedAt IS NULL ORDER BY favorited DESC, updated DESC, normalizedName ASC LIMIT 1",
      [site, creatorId],
    );
    return rows[0] ? mapCreatorRow(rows[0]) : null;
  });
}

export async function upsertCreators(conn: DbConnection, creators: InsertCreatorRow[]): Promise<{ inserted: number; updated: number }> {
  return withDbLog("upsertCreators", { count: creators.length }, async () => {
    let inserted = 0;
    let updated = 0;
    for (const batch of chunk(creators, CREATOR_UPSERT_BATCH_SIZE)) {
      const site = batch[0]?.site;
      const existingRows = site && batch.length > 0
        ? await queryRows(conn, `SELECT service, creatorId FROM \`Creator\` WHERE site = ? AND (${batch.map(() => "(service = ? AND creatorId = ?)").join(" OR ")})`, [site, ...batch.flatMap((creator) => [creator.service, creator.creatorId])])
        : [];
      updated += existingRows.length;
      inserted += Math.max(0, batch.length - existingRows.length);
      const valuesSql = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values = batch.flatMap((creator) => [
        creator.site, creator.service, creator.creatorId, creator.name, creator.normalizedName, creator.indexed, creator.updated,
        creator.favorited, creator.postCount, creator.publicId, creator.relationId, creator.dmCount, creator.shareCount,
        creator.hasChats ? 1 : 0, creator.chatCount, creator.profileImageUrl, creator.bannerImageUrl, creator.rawIndexPayload,
        creator.rawProfilePayload, creator.catalogSyncedAt ?? new Date(), creator.profileCachedAt, creator.profileExpiresAt, creator.archivedAt ?? null,
      ]);
      await executeResult(conn, `INSERT INTO \`Creator\` (site, service, creatorId, name, normalizedName, indexed, updated, favorited, postCount, publicId, relationId, dmCount, shareCount, hasChats, chatCount, profileImageUrl, bannerImageUrl, rawIndexPayload, rawProfilePayload, catalogSyncedAt, profileCachedAt, profileExpiresAt, archivedAt) VALUES ${valuesSql} ON CONFLICT (site, service, creatorId) DO UPDATE SET name = EXCLUDED.name, normalizedName = EXCLUDED.normalizedName, indexed = EXCLUDED.indexed, updated = EXCLUDED.updated, favorited = EXCLUDED.favorited, postCount = EXCLUDED.postCount, publicId = EXCLUDED.publicId, relationId = EXCLUDED.relationId, dmCount = EXCLUDED.dmCount, shareCount = EXCLUDED.shareCount, hasChats = EXCLUDED.hasChats, chatCount = EXCLUDED.chatCount, profileImageUrl = COALESCE(EXCLUDED.profileImageUrl, Creator.profileImageUrl), bannerImageUrl = COALESCE(EXCLUDED.bannerImageUrl, Creator.bannerImageUrl), rawIndexPayload = EXCLUDED.rawIndexPayload, catalogSyncedAt = EXCLUDED.catalogSyncedAt, archivedAt = NULL`, values);
    }
    return { inserted, updated };
  });
}

export async function archiveStaleCreators(conn: DbConnection, site: KimonoSite, activeIds: Array<{ service: string; creatorId: string }>): Promise<number> {
  return withDbLog("archiveStaleCreators", { site, activeCount: activeIds.length }, async () => {
    if (activeIds.length === 0) {
      return executeResult(conn, "UPDATE `Creator` SET archivedAt = NOW(3) WHERE site = ? AND archivedAt IS NULL", [site]);
    }
    return executeResult(conn, `UPDATE \`Creator\` SET archivedAt = NOW(3) WHERE site = ? AND archivedAt IS NULL AND NOT (${activeIds.map(() => "(service = ? AND creatorId = ?)").join(" OR ")})`, [site, ...activeIds.flatMap((entry) => [entry.service, entry.creatorId])]);
  });
}

export async function updateCreatorProfile(conn: DbConnection, site: KimonoSite, service: string, creatorId: string, data: Pick<CreatorRow, "rawProfilePayload" | "profileCachedAt" | "profileExpiresAt">): Promise<void> {
  return withDbLog("updateCreatorProfile", { site, service, creatorId }, async () => {
    await executeResult(conn, "UPDATE `Creator` SET rawProfilePayload = ?, profileCachedAt = ?, profileExpiresAt = ? WHERE site = ? AND service = ? AND creatorId = ?", [data.rawProfilePayload, data.profileCachedAt, data.profileExpiresAt, site, service, creatorId]);
  });
}

export async function isCreatorCatalogFresh(conn: DbConnection, site: KimonoSite): Promise<boolean> {
  return withDbLog("isCreatorCatalogFresh", { site }, async () => {
    const rows = await queryRows<{ syncedAt: unknown; total: number }>(conn, "SELECT MAX(catalogSyncedAt) AS syncedAt, COUNT(*) AS total FROM `Creator` WHERE site = ? AND archivedAt IS NULL", [site]);
    const row = rows[0];
    const syncedAt = toDate(row?.syncedAt);
    return Boolean(row && Number(row.total ?? 0) > 0 && syncedAt && (Date.now() - syncedAt.getTime()) <= TTL.creator.index);
  });
}
export async function getPostById(conn: DbConnection, site: KimonoSite, service: string, creatorId: string, postId: string): Promise<PostRow | null> {
  return withDbLog("getPostById", { site, service, creatorId, postId }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `Post` WHERE site = ? AND service = ? AND creatorId = ? AND postId = ? LIMIT 1", [site, service, creatorId, postId]);
    return rows[0] ? mapPostRow(rows[0]) : null;
  });
}

export async function getCreatorPosts(conn: DbConnection, site: KimonoSite, service: string, creatorId: string, offset: number, limit = 50): Promise<PostRow[]> {
  return withDbLog("getCreatorPosts", { site, service, creatorId, offset, limit }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `Post` WHERE site = ? AND service = ? AND creatorId = ? ORDER BY publishedAt DESC LIMIT ? OFFSET ?", [site, service, creatorId, limit, offset]);
    return rows.map((row) => mapPostRow(row));
  });
}

export async function upsertPost(conn: DbConnection, post: PostRow): Promise<void> {
  return withDbLog("upsertPost", { site: post.site, service: post.service, creatorId: post.creatorId, postId: post.postId }, async () => {
    const existing = await getPostById(conn, post.site, post.service, post.creatorId, post.postId);
    if (existing && existing.detailLevel === "full" && post.detailLevel === "preview") {
      return;
    }
    await executeResult(conn, `INSERT INTO \`Post\` (site, service, creatorId, postId, title, contentHtml, excerpt, publishedAt, addedAt, editedAt, fileName, filePath, attachmentsJson, embedJson, tagsJson, prevPostId, nextPostId, favCount, previewImageUrl, videoUrl, thumbUrl, mediaType, authorName, rawPreviewPayload, rawDetailPayload, detailLevel, sourceKind, isPopular, primaryPopularPeriod, primaryPopularDate, primaryPopularOffset, primaryPopularRank, popularContextsJson, longestVideoUrl, longestVideoDurationSeconds, previewStatus, nativeThumbnailUrl, previewThumbnailAssetPath, previewClipAssetPath, previewGeneratedAt, previewError, previewSourceFingerprint, mediaMimeType, mediaWidth, mediaHeight, cachedAt, expiresAt, staleUntil, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site, service, creatorId, postId) DO UPDATE SET title = EXCLUDED.title, contentHtml = EXCLUDED.contentHtml, excerpt = EXCLUDED.excerpt, publishedAt = EXCLUDED.publishedAt, addedAt = EXCLUDED.addedAt, editedAt = EXCLUDED.editedAt, fileName = EXCLUDED.fileName, filePath = EXCLUDED.filePath, attachmentsJson = EXCLUDED.attachmentsJson, embedJson = EXCLUDED.embedJson, tagsJson = EXCLUDED.tagsJson, prevPostId = EXCLUDED.prevPostId, nextPostId = EXCLUDED.nextPostId, favCount = EXCLUDED.favCount, previewImageUrl = EXCLUDED.previewImageUrl, videoUrl = EXCLUDED.videoUrl, thumbUrl = EXCLUDED.thumbUrl, mediaType = EXCLUDED.mediaType, authorName = EXCLUDED.authorName, rawPreviewPayload = EXCLUDED.rawPreviewPayload, rawDetailPayload = EXCLUDED.rawDetailPayload, detailLevel = EXCLUDED.detailLevel, sourceKind = EXCLUDED.sourceKind, isPopular = EXCLUDED.isPopular, primaryPopularPeriod = EXCLUDED.primaryPopularPeriod, primaryPopularDate = EXCLUDED.primaryPopularDate, primaryPopularOffset = EXCLUDED.primaryPopularOffset, primaryPopularRank = EXCLUDED.primaryPopularRank, popularContextsJson = EXCLUDED.popularContextsJson, longestVideoUrl = EXCLUDED.longestVideoUrl, longestVideoDurationSeconds = EXCLUDED.longestVideoDurationSeconds, previewStatus = EXCLUDED.previewStatus, nativeThumbnailUrl = EXCLUDED.nativeThumbnailUrl, previewThumbnailAssetPath = EXCLUDED.previewThumbnailAssetPath, previewClipAssetPath = EXCLUDED.previewClipAssetPath, previewGeneratedAt = EXCLUDED.previewGeneratedAt, previewError = EXCLUDED.previewError, previewSourceFingerprint = EXCLUDED.previewSourceFingerprint, mediaMimeType = EXCLUDED.mediaMimeType, mediaWidth = EXCLUDED.mediaWidth, mediaHeight = EXCLUDED.mediaHeight, cachedAt = EXCLUDED.cachedAt, expiresAt = EXCLUDED.expiresAt, staleUntil = EXCLUDED.staleUntil, lastSeenAt = EXCLUDED.lastSeenAt`, [post.site, post.service, post.creatorId, post.postId, post.title, post.contentHtml, post.excerpt, post.publishedAt, post.addedAt, post.editedAt, post.fileName, post.filePath, post.attachmentsJson, post.embedJson, post.tagsJson, post.prevPostId, post.nextPostId, post.favCount, post.previewImageUrl, post.videoUrl, post.thumbUrl, post.mediaType, post.authorName, post.rawPreviewPayload, post.rawDetailPayload, post.detailLevel, post.sourceKind, post.isPopular ? 1 : 0, post.primaryPopularPeriod, post.primaryPopularDate, post.primaryPopularOffset, post.primaryPopularRank, post.popularContextsJson, post.longestVideoUrl, post.longestVideoDurationSeconds, post.previewStatus, post.nativeThumbnailUrl, post.previewThumbnailAssetPath, post.previewClipAssetPath, post.previewGeneratedAt, post.previewError, post.previewSourceFingerprint, post.mediaMimeType, post.mediaWidth, post.mediaHeight, post.cachedAt, post.expiresAt, post.staleUntil, post.lastSeenAt]);
  });
}

export async function upsertPosts(conn: DbConnection, posts: PostRow[]): Promise<void> {
  for (const post of posts) {
    await upsertPost(conn, post);
  }
}

export async function getPopularPosts(conn: DbConnection, site: KimonoSite, period: "recent" | "day" | "week" | "month", date?: string, offset = 0, limit = 50): Promise<PostRow[]> {
  return withDbLog("getPopularPosts", { site, period, date: date ?? null, offset, limit }, async () => {
    const values: unknown[] = [site, period];
    let sql = "SELECT * FROM `Post` WHERE site = ? AND isPopular = 1 AND primaryPopularPeriod = ?";
    if (date) {
      sql += " AND primaryPopularDate = ?";
      values.push(date);
    }
    sql += " ORDER BY primaryPopularRank ASC LIMIT ? OFFSET ?";
    values.push(limit, offset);
    const rows = await queryRows(conn, sql, values);
    return rows.map((row) => mapPostRow(row));
  });
}

export async function deleteExpiredPosts(conn: DbConnection): Promise<number> {
  return withDbLog("deleteExpiredPosts", {}, async () => executeResult(conn, "DELETE FROM `Post` WHERE expiresAt < NOW(3) AND (staleUntil IS NULL OR staleUntil < NOW(3))"));
}

export async function getMediaAsset(conn: DbConnection, site: KimonoSite, sourceFingerprint: string): Promise<MediaAssetRow | null> {
  return withDbLog("getMediaAsset", { site, sourceFingerprint }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `MediaAsset` WHERE site = ? AND sourceFingerprint = ? LIMIT 1", [site, sourceFingerprint]);
    return rows[0] ? mapMediaAssetRow(rows[0]) : null;
  });
}

export async function upsertMediaAsset(conn: DbConnection, asset: MediaAssetRow): Promise<void> {
  return withDbLog("upsertMediaAsset", { site: asset.site, sourceFingerprint: asset.sourceFingerprint }, async () => {
    await executeResult(conn, `INSERT INTO \`MediaAsset\` (site, sourceFingerprint, sourceUrl, sourcePath, mediaKind, mimeType, width, height, durationSeconds, nativeThumbnailUrl, thumbnailAssetPath, clipAssetPath, probeStatus, previewStatus, firstSeenAt, lastSeenAt, hotUntil, retryAfter, generationAttempts, lastError, lastObservedContext, cachedAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site, sourceFingerprint) DO UPDATE SET sourceUrl = EXCLUDED.sourceUrl, sourcePath = EXCLUDED.sourcePath, mediaKind = EXCLUDED.mediaKind, mimeType = EXCLUDED.mimeType, width = EXCLUDED.width, height = EXCLUDED.height, durationSeconds = EXCLUDED.durationSeconds, nativeThumbnailUrl = EXCLUDED.nativeThumbnailUrl, thumbnailAssetPath = EXCLUDED.thumbnailAssetPath, clipAssetPath = EXCLUDED.clipAssetPath, probeStatus = EXCLUDED.probeStatus, previewStatus = EXCLUDED.previewStatus, firstSeenAt = EXCLUDED.firstSeenAt, lastSeenAt = EXCLUDED.lastSeenAt, hotUntil = EXCLUDED.hotUntil, retryAfter = EXCLUDED.retryAfter, generationAttempts = EXCLUDED.generationAttempts, lastError = EXCLUDED.lastError, lastObservedContext = EXCLUDED.lastObservedContext, cachedAt = EXCLUDED.cachedAt, expiresAt = EXCLUDED.expiresAt`, [asset.site, asset.sourceFingerprint, asset.sourceUrl, asset.sourcePath, asset.mediaKind, asset.mimeType, asset.width, asset.height, asset.durationSeconds, asset.nativeThumbnailUrl, asset.thumbnailAssetPath, asset.clipAssetPath, asset.probeStatus, asset.previewStatus, asset.firstSeenAt, asset.lastSeenAt, asset.hotUntil, asset.retryAfter, asset.generationAttempts, asset.lastError, asset.lastObservedContext, asset.cachedAt, asset.expiresAt]);
  });
}

export async function updateMediaAssetStatus(conn: DbConnection, site: KimonoSite, sourceFingerprint: string, data: Partial<Pick<MediaAssetRow, "probeStatus" | "previewStatus" | "thumbnailAssetPath" | "clipAssetPath" | "generationAttempts" | "lastError" | "retryAfter" | "hotUntil" | "nativeThumbnailUrl" | "mediaKind" | "mimeType" | "width" | "height" | "durationSeconds" | "lastSeenAt">>): Promise<void> {
  return withDbLog("updateMediaAssetStatus", { site, sourceFingerprint }, async () => {
    const update = buildDynamicUpdate(data as Record<string, unknown>);
    if (!update.sql) return;
    await executeResult(conn, `UPDATE \`MediaAsset\` SET ${update.sql} WHERE site = ? AND sourceFingerprint = ?`, [...update.values, site, sourceFingerprint]);
  });
}

export async function deleteStaleMediaAssets(conn: DbConnection): Promise<number> {
  return withDbLog("deleteStaleMediaAssets", {}, async () => executeResult(conn, "DELETE FROM `MediaAsset` WHERE lastSeenAt < ?", [new Date(Date.now() - TTL.media.preview)]));
}
export async function getMediaSource(conn: DbConnection, site: KimonoSite, sourceFingerprint: string): Promise<MediaSourceRow | null> {
  return withDbLog("getMediaSource", { site, sourceFingerprint }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `MediaSource` WHERE site = ? AND sourceFingerprint = ? LIMIT 1", [site, sourceFingerprint]);
    return rows[0] ? mapMediaSourceRow(rows[0]) : null;
  });
}

export async function upsertMediaSource(conn: DbConnection, source: MediaSourceRow): Promise<void> {
  return withDbLog("upsertMediaSource", { site: source.site, sourceFingerprint: source.sourceFingerprint }, async () => {
    await executeResult(conn, `INSERT INTO \`MediaSource\` (site, sourceFingerprint, sourceUrl, sourcePath, localPath, downloadStatus, downloadedAt, lastSeenAt, retentionUntil, fileSizeBytes, mimeType, downloadError, downloadAttempts, lastObservedContext, priorityClass, retryAfter, firstSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site, sourceFingerprint) DO UPDATE SET sourceUrl = EXCLUDED.sourceUrl, sourcePath = EXCLUDED.sourcePath, localPath = EXCLUDED.localPath, downloadStatus = EXCLUDED.downloadStatus, downloadedAt = EXCLUDED.downloadedAt, lastSeenAt = EXCLUDED.lastSeenAt, retentionUntil = EXCLUDED.retentionUntil, fileSizeBytes = EXCLUDED.fileSizeBytes, mimeType = EXCLUDED.mimeType, downloadError = EXCLUDED.downloadError, downloadAttempts = EXCLUDED.downloadAttempts, lastObservedContext = EXCLUDED.lastObservedContext, priorityClass = EXCLUDED.priorityClass, retryAfter = EXCLUDED.retryAfter, firstSeenAt = EXCLUDED.firstSeenAt`, [source.site, source.sourceFingerprint, source.sourceUrl, source.sourcePath, source.localPath, source.downloadStatus, source.downloadedAt, source.lastSeenAt, source.retentionUntil, source.fileSizeBytes, source.mimeType, source.downloadError, source.downloadAttempts, source.lastObservedContext, source.priorityClass, source.retryAfter, source.firstSeenAt]);
  });
}

export async function updateMediaSourceDownload(conn: DbConnection, site: KimonoSite, sourceFingerprint: string, data: Partial<Pick<MediaSourceRow, "downloadStatus" | "downloadedAt" | "localPath" | "fileSizeBytes" | "downloadError" | "downloadAttempts" | "retryAfter">>): Promise<void> {
  return withDbLog("updateMediaSourceDownload", { site, sourceFingerprint }, async () => {
    const update = buildDynamicUpdate(data as Record<string, unknown>);
    if (!update.sql) return;
    await executeResult(conn, `UPDATE \`MediaSource\` SET ${update.sql} WHERE site = ? AND sourceFingerprint = ?`, [...update.values, site, sourceFingerprint]);
  });
}

export async function deleteExpiredMediaSources(conn: DbConnection): Promise<number> {
  return withDbLog("deleteExpiredMediaSources", {}, async () => executeResult(conn, "DELETE FROM `MediaSource` WHERE retentionUntil IS NOT NULL AND retentionUntil < NOW(3)"));
}

export async function getFavoriteChronology(conn: DbConnection, kind: FavoriteKind, site: KimonoSite): Promise<FavoriteChronologyRow[]> {
  return withDbLog("getFavoriteChronology", { kind, site }, async () => {
    const hasFavedSeq = await hasFavoriteChronologyFavedSeq(conn);
    const rows = await queryRows(
      conn,
      hasFavedSeq
        ? "SELECT * FROM `FavoriteChronology` WHERE kind = ? AND site = ? ORDER BY CASE WHEN favedSeq IS NULL THEN 1 ELSE 0 END ASC, favedSeq DESC, favoritedAt DESC"
        : "SELECT * FROM `FavoriteChronology` WHERE kind = ? AND site = ? ORDER BY favoritedAt DESC",
      [kind, site],
    );
    return rows.map((row) => mapFavoriteChronologyRow(row));
  });
}

export async function upsertFavoriteChronologyEntry(conn: DbConnection, entry: FavoriteChronologyRow): Promise<void> {
  return withDbLog("upsertFavoriteChronologyEntry", { kind: entry.kind, site: entry.site, service: entry.service, creatorId: entry.creatorId }, async () => {
    const hasFavedSeq = await hasFavoriteChronologyFavedSeq(conn);
    if (hasFavedSeq) {
      await executeResult(conn, "INSERT INTO `FavoriteChronology` (kind, site, service, creatorId, postId, favoritedAt, lastConfirmedAt, favedSeq) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (kind, site, service, creatorId, postId) DO UPDATE SET favoritedAt = COALESCE(FavoriteChronology.favoritedAt, EXCLUDED.favoritedAt), lastConfirmedAt = EXCLUDED.lastConfirmedAt, favedSeq = COALESCE(FavoriteChronology.favedSeq, EXCLUDED.favedSeq)", [entry.kind, entry.site, entry.service, entry.creatorId, entry.postId ?? "", entry.favoritedAt, entry.lastConfirmedAt, entry.favedSeq]);
      return;
    }

    await executeResult(conn, "INSERT INTO `FavoriteChronology` (kind, site, service, creatorId, postId, favoritedAt, lastConfirmedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (kind, site, service, creatorId, postId) DO UPDATE SET favoritedAt = COALESCE(FavoriteChronology.favoritedAt, EXCLUDED.favoritedAt), lastConfirmedAt = EXCLUDED.lastConfirmedAt", [entry.kind, entry.site, entry.service, entry.creatorId, entry.postId ?? "", entry.favoritedAt, entry.lastConfirmedAt]);
  });
}

export async function deleteFavoriteChronologyEntry(conn: DbConnection, kind: FavoriteKind, site: KimonoSite, service: string, creatorId: string, postId = ""): Promise<void> {
  return withDbLog("deleteFavoriteChronologyEntry", { kind, site, service, creatorId, postId }, async () => {
    await executeResult(conn, "DELETE FROM `FavoriteChronology` WHERE kind = ? AND site = ? AND service = ? AND creatorId = ? AND postId = ?", [kind, site, service, creatorId, postId]);
  });
}

export async function getFavoriteCache(conn: DbConnection, kind: FavoriteKind, site: KimonoSite): Promise<FavoriteCacheRow | null> {
  return withDbLog("getFavoriteCache", { kind, site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `FavoriteCache` WHERE kind = ? AND site = ? LIMIT 1", [kind, site]);
    return rows[0] ? mapFavoriteCacheRow(rows[0]) : null;
  });
}

export async function upsertFavoriteCache(conn: DbConnection, entry: FavoriteCacheRow): Promise<void> {
  return withDbLog("upsertFavoriteCache", { kind: entry.kind, site: entry.site }, async () => {
    await executeResult(conn, "INSERT INTO `FavoriteCache` (kind, site, payloadJson, updatedAt, expiresAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, site) DO UPDATE SET payloadJson = EXCLUDED.payloadJson, updatedAt = EXCLUDED.updatedAt, expiresAt = EXCLUDED.expiresAt", [entry.kind, entry.site, entry.payloadJson, entry.updatedAt, entry.expiresAt]);
  });
}

export async function getDiscoveryCache(conn: DbConnection, site: KimonoSite | "global"): Promise<DiscoveryCacheRow | null> {
  return withDbLog("getDiscoveryCache", { site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `DiscoveryCache` WHERE site = ? LIMIT 1", [site]);
    return rows[0] ? mapDiscoveryCacheRow(rows[0]) : null;
  });
}

export async function upsertDiscoveryCache(conn: DbConnection, entry: DiscoveryCacheRow): Promise<void> {
  return withDbLog("upsertDiscoveryCache", { site: entry.site }, async () => {
    await executeResult(conn, "INSERT INTO `DiscoveryCache` (site, payloadJson, updatedAt, expiresAt) VALUES (?, ?, ?, ?) ON CONFLICT (site) DO UPDATE SET payloadJson = EXCLUDED.payloadJson, updatedAt = EXCLUDED.updatedAt, expiresAt = EXCLUDED.expiresAt", [entry.site, entry.payloadJson, entry.updatedAt, entry.expiresAt]);
  });
}

export async function getDiscoveryBlocks(conn: DbConnection, site: KimonoSite): Promise<DiscoveryBlockRow[]> {
  return withDbLog("getDiscoveryBlocks", { site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `DiscoveryBlock` WHERE site = ? ORDER BY blockedAt DESC", [site]);
    return rows.map((row) => mapDiscoveryBlockRow(row));
  });
}

export async function upsertDiscoveryBlock(conn: DbConnection, block: DiscoveryBlockRow): Promise<void> {
  return withDbLog("upsertDiscoveryBlock", { site: block.site, service: block.service, creatorId: block.creatorId }, async () => {
    await executeResult(conn, "INSERT INTO `DiscoveryBlock` (site, service, creatorId, blockedAt) VALUES (?, ?, ?, ?) ON CONFLICT (site, service, creatorId) DO UPDATE SET blockedAt = EXCLUDED.blockedAt", [block.site, block.service, block.creatorId, block.blockedAt]);
  });
}

export async function deleteDiscoveryBlock(conn: DbConnection, site: KimonoSite, service: string, creatorId: string): Promise<void> {
  return withDbLog("deleteDiscoveryBlock", { site, service, creatorId }, async () => {
    await executeResult(conn, "DELETE FROM `DiscoveryBlock` WHERE site = ? AND service = ? AND creatorId = ?", [site, service, creatorId]);
  });
}

export async function getLatestKimonoSession(conn: DbConnection, site: KimonoSite): Promise<KimonoSessionRow | null> {
  return withDbLog("getLatestKimonoSession", { site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `KimonoSession` WHERE site = ? ORDER BY savedAt DESC LIMIT 1", [site]);
    return rows[0] ? mapKimonoSessionRow(rows[0]) : null;
  });
}

export async function upsertKimonoSession(conn: DbConnection, session: KimonoSessionRow): Promise<void> {
  return withDbLog("upsertKimonoSession", { site: session.site, username: session.username }, async () => {
    await executeResult(conn, "INSERT INTO `KimonoSession` (id, site, cookie, username, savedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT (site) DO UPDATE SET id = EXCLUDED.id, cookie = EXCLUDED.cookie, username = EXCLUDED.username, savedAt = EXCLUDED.savedAt", [session.id, session.site, session.cookie, session.username, session.savedAt]);
  });
}

export async function deleteKimonoSession(conn: DbConnection, site: KimonoSite): Promise<void> {
  return withDbLog("deleteKimonoSession", { site }, async () => {
    await executeResult(conn, "DELETE FROM `KimonoSession` WHERE site = ?", [site]);
  });
}







