
import type { Connection } from "mysql2/promise";

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

type QueryableConnection = Pick<Connection, "query" | "execute">;
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

function getRepositoryDialect(): "mysql" | "sqlite" {
  return String(process.env.DATABASE_URL ?? "").startsWith("mysql") ? "mysql" : "sqlite";
}

async function hasColumn(conn: QueryableConnection, tableName: string, columnName: string): Promise<boolean> {
  const dialect = getRepositoryDialect();
  const cacheKey = `${dialect}:${tableName}:${columnName}`;
  const cached = columnPresenceCache.get(cacheKey);
  if (typeof cached === "boolean") {
    return cached;
  }

  try {
    let present = false;
    if (dialect === "mysql") {
      const rows = await queryRows<{ total?: unknown }>(
        conn,
        "SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        [tableName, columnName],
      );
      present = Number(rows[0]?.total ?? 0) > 0;
    } else {
      const rows = await queryRows<{ name?: unknown }>(conn, `PRAGMA table_info(\`${tableName}\`)`);
      present = rows.some((row) => String(row.name ?? "") === columnName);
    }

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

export async function searchCreators(conn: Connection, opts: SearchCreatorsOpts): Promise<SearchCreatorsResult> {
  return withDbLog("searchCreators", opts as Record<string, unknown>, async () => {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const perPage = Math.max(1, Math.min(100, Math.floor(opts.perPage ?? 50)));
    const order = opts.order === "asc" ? "ASC" : "DESC";
    const sortColumn = opts.sort === "name" ? "normalizedName" : opts.sort === "updated" ? "updated" : "favorited";
    const where: string[] = ["archivedAt IS NULL"];
    const values: unknown[] = [];
    if (opts.site) {
      where.push("site = ?");
      values.push(opts.site);
    }
    if (opts.service) {
      where.push("service = ?");
      values.push(opts.service);
    }
    if (opts.q?.trim()) {
      where.push("(normalizedName LIKE ? OR name LIKE ? OR creatorId LIKE ?)");
      const normalized = `%${opts.q.trim().toLowerCase()}%`;
      const raw = `%${opts.q.trim()}%`;
      values.push(normalized, raw, raw);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const countRows = await queryRows<{ total: number }>(conn, `SELECT COUNT(*) AS total FROM \`Creator\` ${whereSql}`, values);
    const rows = await queryRows(conn, `SELECT * FROM \`Creator\` ${whereSql} ORDER BY \`${sortColumn}\` ${order}, normalizedName ASC LIMIT ? OFFSET ?`, [...values, perPage, (page - 1) * perPage]);
    return {
      rows: rows.map((row) => mapCreatorRow(row)),
      total: Number(countRows[0]?.total ?? 0),
      snapshotFresh: await isCreatorCatalogFresh(conn, opts.site ?? "kemono"),
    };
  });
}

export async function getCreatorById(conn: Connection, site: KimonoSite, service: string, creatorId: string): Promise<CreatorRow | null> {
  return withDbLog("getCreatorById", { site, service, creatorId }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `Creator` WHERE site = ? AND service = ? AND creatorId = ? LIMIT 1", [site, service, creatorId]);
    return rows[0] ? mapCreatorRow(rows[0]) : null;
  });
}

export async function upsertCreators(conn: Connection, creators: InsertCreatorRow[]): Promise<{ inserted: number; updated: number }> {
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
      await executeResult(conn, `INSERT INTO \`Creator\` (site, service, creatorId, name, normalizedName, indexed, updated, favorited, postCount, publicId, relationId, dmCount, shareCount, hasChats, chatCount, profileImageUrl, bannerImageUrl, rawIndexPayload, rawProfilePayload, catalogSyncedAt, profileCachedAt, profileExpiresAt, archivedAt) VALUES ${valuesSql} ON DUPLICATE KEY UPDATE name=VALUES(name), normalizedName=VALUES(normalizedName), indexed=VALUES(indexed), updated=VALUES(updated), favorited=VALUES(favorited), postCount=VALUES(postCount), publicId=VALUES(publicId), relationId=VALUES(relationId), dmCount=VALUES(dmCount), shareCount=VALUES(shareCount), hasChats=VALUES(hasChats), chatCount=VALUES(chatCount), profileImageUrl=COALESCE(VALUES(profileImageUrl), profileImageUrl), bannerImageUrl=COALESCE(VALUES(bannerImageUrl), bannerImageUrl), rawIndexPayload=VALUES(rawIndexPayload), catalogSyncedAt=VALUES(catalogSyncedAt)`, values);
    }
    return { inserted, updated };
  });
}

export async function archiveStaleCreators(conn: Connection, site: KimonoSite, activeIds: Array<{ service: string; creatorId: string }>): Promise<number> {
  return withDbLog("archiveStaleCreators", { site, activeCount: activeIds.length }, async () => {
    if (activeIds.length === 0) {
      return executeResult(conn, "UPDATE `Creator` SET archivedAt = NOW(3) WHERE site = ? AND archivedAt IS NULL", [site]);
    }
    return executeResult(conn, `UPDATE \`Creator\` SET archivedAt = NOW(3) WHERE site = ? AND archivedAt IS NULL AND NOT (${activeIds.map(() => "(service = ? AND creatorId = ?)").join(" OR ")})`, [site, ...activeIds.flatMap((entry) => [entry.service, entry.creatorId])]);
  });
}

export async function updateCreatorProfile(conn: Connection, site: KimonoSite, service: string, creatorId: string, data: Pick<CreatorRow, "rawProfilePayload" | "profileCachedAt" | "profileExpiresAt">): Promise<void> {
  return withDbLog("updateCreatorProfile", { site, service, creatorId }, async () => {
    await executeResult(conn, "UPDATE `Creator` SET rawProfilePayload = ?, profileCachedAt = ?, profileExpiresAt = ? WHERE site = ? AND service = ? AND creatorId = ?", [data.rawProfilePayload, data.profileCachedAt, data.profileExpiresAt, site, service, creatorId]);
  });
}

export async function isCreatorCatalogFresh(conn: Connection, site: KimonoSite): Promise<boolean> {
  return withDbLog("isCreatorCatalogFresh", { site }, async () => {
    const rows = await queryRows<{ syncedAt: unknown; total: number }>(conn, "SELECT MAX(catalogSyncedAt) AS syncedAt, COUNT(*) AS total FROM `Creator` WHERE site = ? AND archivedAt IS NULL", [site]);
    const row = rows[0];
    const syncedAt = toDate(row?.syncedAt);
    return Boolean(row && Number(row.total ?? 0) > 0 && syncedAt && (Date.now() - syncedAt.getTime()) <= TTL.creator.index);
  });
}
export async function getPostById(conn: Connection, site: KimonoSite, service: string, creatorId: string, postId: string): Promise<PostRow | null> {
  return withDbLog("getPostById", { site, service, creatorId, postId }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `Post` WHERE site = ? AND service = ? AND creatorId = ? AND postId = ? LIMIT 1", [site, service, creatorId, postId]);
    return rows[0] ? mapPostRow(rows[0]) : null;
  });
}

export async function getCreatorPosts(conn: Connection, site: KimonoSite, service: string, creatorId: string, offset: number, limit = 50): Promise<PostRow[]> {
  return withDbLog("getCreatorPosts", { site, service, creatorId, offset, limit }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `Post` WHERE site = ? AND service = ? AND creatorId = ? ORDER BY publishedAt DESC LIMIT ? OFFSET ?", [site, service, creatorId, limit, offset]);
    return rows.map((row) => mapPostRow(row));
  });
}

export async function upsertPost(conn: Connection, post: PostRow): Promise<void> {
  return withDbLog("upsertPost", { site: post.site, service: post.service, creatorId: post.creatorId, postId: post.postId }, async () => {
    const existing = await getPostById(conn, post.site, post.service, post.creatorId, post.postId);
    if (existing && existing.detailLevel === "full" && post.detailLevel === "preview") {
      return;
    }
    await executeResult(conn, `INSERT INTO \`Post\` (site, service, creatorId, postId, title, contentHtml, excerpt, publishedAt, addedAt, editedAt, fileName, filePath, attachmentsJson, embedJson, tagsJson, prevPostId, nextPostId, favCount, previewImageUrl, videoUrl, thumbUrl, mediaType, authorName, rawPreviewPayload, rawDetailPayload, detailLevel, sourceKind, isPopular, primaryPopularPeriod, primaryPopularDate, primaryPopularOffset, primaryPopularRank, popularContextsJson, longestVideoUrl, longestVideoDurationSeconds, previewStatus, nativeThumbnailUrl, previewThumbnailAssetPath, previewClipAssetPath, previewGeneratedAt, previewError, previewSourceFingerprint, mediaMimeType, mediaWidth, mediaHeight, cachedAt, expiresAt, staleUntil, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), contentHtml=VALUES(contentHtml), excerpt=VALUES(excerpt), publishedAt=VALUES(publishedAt), addedAt=VALUES(addedAt), editedAt=VALUES(editedAt), fileName=VALUES(fileName), filePath=VALUES(filePath), attachmentsJson=VALUES(attachmentsJson), embedJson=VALUES(embedJson), tagsJson=VALUES(tagsJson), prevPostId=VALUES(prevPostId), nextPostId=VALUES(nextPostId), favCount=VALUES(favCount), previewImageUrl=VALUES(previewImageUrl), videoUrl=VALUES(videoUrl), thumbUrl=VALUES(thumbUrl), mediaType=VALUES(mediaType), authorName=VALUES(authorName), rawPreviewPayload=VALUES(rawPreviewPayload), rawDetailPayload=VALUES(rawDetailPayload), detailLevel=VALUES(detailLevel), sourceKind=VALUES(sourceKind), isPopular=VALUES(isPopular), primaryPopularPeriod=VALUES(primaryPopularPeriod), primaryPopularDate=VALUES(primaryPopularDate), primaryPopularOffset=VALUES(primaryPopularOffset), primaryPopularRank=VALUES(primaryPopularRank), popularContextsJson=VALUES(popularContextsJson), longestVideoUrl=VALUES(longestVideoUrl), longestVideoDurationSeconds=VALUES(longestVideoDurationSeconds), previewStatus=VALUES(previewStatus), nativeThumbnailUrl=VALUES(nativeThumbnailUrl), previewThumbnailAssetPath=VALUES(previewThumbnailAssetPath), previewClipAssetPath=VALUES(previewClipAssetPath), previewGeneratedAt=VALUES(previewGeneratedAt), previewError=VALUES(previewError), previewSourceFingerprint=VALUES(previewSourceFingerprint), mediaMimeType=VALUES(mediaMimeType), mediaWidth=VALUES(mediaWidth), mediaHeight=VALUES(mediaHeight), cachedAt=VALUES(cachedAt), expiresAt=VALUES(expiresAt), staleUntil=VALUES(staleUntil), lastSeenAt=VALUES(lastSeenAt)`, [post.site, post.service, post.creatorId, post.postId, post.title, post.contentHtml, post.excerpt, post.publishedAt, post.addedAt, post.editedAt, post.fileName, post.filePath, post.attachmentsJson, post.embedJson, post.tagsJson, post.prevPostId, post.nextPostId, post.favCount, post.previewImageUrl, post.videoUrl, post.thumbUrl, post.mediaType, post.authorName, post.rawPreviewPayload, post.rawDetailPayload, post.detailLevel, post.sourceKind, post.isPopular ? 1 : 0, post.primaryPopularPeriod, post.primaryPopularDate, post.primaryPopularOffset, post.primaryPopularRank, post.popularContextsJson, post.longestVideoUrl, post.longestVideoDurationSeconds, post.previewStatus, post.nativeThumbnailUrl, post.previewThumbnailAssetPath, post.previewClipAssetPath, post.previewGeneratedAt, post.previewError, post.previewSourceFingerprint, post.mediaMimeType, post.mediaWidth, post.mediaHeight, post.cachedAt, post.expiresAt, post.staleUntil, post.lastSeenAt]);
  });
}

export async function upsertPosts(conn: Connection, posts: PostRow[]): Promise<void> {
  for (const post of posts) {
    await upsertPost(conn, post);
  }
}

export async function getPopularPosts(conn: Connection, site: KimonoSite, period: "recent" | "day" | "week" | "month", date?: string, offset = 0, limit = 50): Promise<PostRow[]> {
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

export async function deleteExpiredPosts(conn: Connection): Promise<number> {
  return withDbLog("deleteExpiredPosts", {}, async () => executeResult(conn, "DELETE FROM `Post` WHERE expiresAt < NOW(3) AND (staleUntil IS NULL OR staleUntil < NOW(3))"));
}

export async function getMediaAsset(conn: Connection, site: KimonoSite, sourceFingerprint: string): Promise<MediaAssetRow | null> {
  return withDbLog("getMediaAsset", { site, sourceFingerprint }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `MediaAsset` WHERE site = ? AND sourceFingerprint = ? LIMIT 1", [site, sourceFingerprint]);
    return rows[0] ? mapMediaAssetRow(rows[0]) : null;
  });
}

export async function upsertMediaAsset(conn: Connection, asset: MediaAssetRow): Promise<void> {
  return withDbLog("upsertMediaAsset", { site: asset.site, sourceFingerprint: asset.sourceFingerprint }, async () => {
    await executeResult(conn, `INSERT INTO \`MediaAsset\` (site, sourceFingerprint, sourceUrl, sourcePath, mediaKind, mimeType, width, height, durationSeconds, nativeThumbnailUrl, thumbnailAssetPath, clipAssetPath, probeStatus, previewStatus, firstSeenAt, lastSeenAt, hotUntil, retryAfter, generationAttempts, lastError, lastObservedContext, cachedAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE sourceUrl=VALUES(sourceUrl), sourcePath=VALUES(sourcePath), mediaKind=VALUES(mediaKind), mimeType=VALUES(mimeType), width=VALUES(width), height=VALUES(height), durationSeconds=VALUES(durationSeconds), nativeThumbnailUrl=VALUES(nativeThumbnailUrl), thumbnailAssetPath=VALUES(thumbnailAssetPath), clipAssetPath=VALUES(clipAssetPath), probeStatus=VALUES(probeStatus), previewStatus=VALUES(previewStatus), firstSeenAt=VALUES(firstSeenAt), lastSeenAt=VALUES(lastSeenAt), hotUntil=VALUES(hotUntil), retryAfter=VALUES(retryAfter), generationAttempts=VALUES(generationAttempts), lastError=VALUES(lastError), lastObservedContext=VALUES(lastObservedContext), cachedAt=VALUES(cachedAt), expiresAt=VALUES(expiresAt)`, [asset.site, asset.sourceFingerprint, asset.sourceUrl, asset.sourcePath, asset.mediaKind, asset.mimeType, asset.width, asset.height, asset.durationSeconds, asset.nativeThumbnailUrl, asset.thumbnailAssetPath, asset.clipAssetPath, asset.probeStatus, asset.previewStatus, asset.firstSeenAt, asset.lastSeenAt, asset.hotUntil, asset.retryAfter, asset.generationAttempts, asset.lastError, asset.lastObservedContext, asset.cachedAt, asset.expiresAt]);
  });
}

export async function updateMediaAssetStatus(conn: Connection, site: KimonoSite, sourceFingerprint: string, data: Partial<Pick<MediaAssetRow, "probeStatus" | "previewStatus" | "thumbnailAssetPath" | "clipAssetPath" | "generationAttempts" | "lastError" | "retryAfter" | "hotUntil" | "nativeThumbnailUrl" | "mediaKind" | "mimeType" | "width" | "height" | "durationSeconds" | "lastSeenAt">>): Promise<void> {
  return withDbLog("updateMediaAssetStatus", { site, sourceFingerprint }, async () => {
    const update = buildDynamicUpdate(data as Record<string, unknown>);
    if (!update.sql) return;
    await executeResult(conn, `UPDATE \`MediaAsset\` SET ${update.sql} WHERE site = ? AND sourceFingerprint = ?`, [...update.values, site, sourceFingerprint]);
  });
}

export async function deleteStaleMediaAssets(conn: Connection): Promise<number> {
  return withDbLog("deleteStaleMediaAssets", {}, async () => executeResult(conn, "DELETE FROM `MediaAsset` WHERE lastSeenAt < ?", [new Date(Date.now() - TTL.media.preview)]));
}
export async function getMediaSource(conn: Connection, site: KimonoSite, sourceFingerprint: string): Promise<MediaSourceRow | null> {
  return withDbLog("getMediaSource", { site, sourceFingerprint }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `MediaSource` WHERE site = ? AND sourceFingerprint = ? LIMIT 1", [site, sourceFingerprint]);
    return rows[0] ? mapMediaSourceRow(rows[0]) : null;
  });
}

export async function upsertMediaSource(conn: Connection, source: MediaSourceRow): Promise<void> {
  return withDbLog("upsertMediaSource", { site: source.site, sourceFingerprint: source.sourceFingerprint }, async () => {
    await executeResult(conn, `INSERT INTO \`MediaSource\` (site, sourceFingerprint, sourceUrl, sourcePath, localPath, downloadStatus, downloadedAt, lastSeenAt, retentionUntil, fileSizeBytes, mimeType, downloadError, downloadAttempts, lastObservedContext, priorityClass, retryAfter, firstSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE sourceUrl=VALUES(sourceUrl), sourcePath=VALUES(sourcePath), localPath=VALUES(localPath), downloadStatus=VALUES(downloadStatus), downloadedAt=VALUES(downloadedAt), lastSeenAt=VALUES(lastSeenAt), retentionUntil=VALUES(retentionUntil), fileSizeBytes=VALUES(fileSizeBytes), mimeType=VALUES(mimeType), downloadError=VALUES(downloadError), downloadAttempts=VALUES(downloadAttempts), lastObservedContext=VALUES(lastObservedContext), priorityClass=VALUES(priorityClass), retryAfter=VALUES(retryAfter), firstSeenAt=VALUES(firstSeenAt)`, [source.site, source.sourceFingerprint, source.sourceUrl, source.sourcePath, source.localPath, source.downloadStatus, source.downloadedAt, source.lastSeenAt, source.retentionUntil, source.fileSizeBytes, source.mimeType, source.downloadError, source.downloadAttempts, source.lastObservedContext, source.priorityClass, source.retryAfter, source.firstSeenAt]);
  });
}

export async function updateMediaSourceDownload(conn: Connection, site: KimonoSite, sourceFingerprint: string, data: Partial<Pick<MediaSourceRow, "downloadStatus" | "downloadedAt" | "localPath" | "fileSizeBytes" | "downloadError" | "downloadAttempts" | "retryAfter">>): Promise<void> {
  return withDbLog("updateMediaSourceDownload", { site, sourceFingerprint }, async () => {
    const update = buildDynamicUpdate(data as Record<string, unknown>);
    if (!update.sql) return;
    await executeResult(conn, `UPDATE \`MediaSource\` SET ${update.sql} WHERE site = ? AND sourceFingerprint = ?`, [...update.values, site, sourceFingerprint]);
  });
}

export async function deleteExpiredMediaSources(conn: Connection): Promise<number> {
  return withDbLog("deleteExpiredMediaSources", {}, async () => executeResult(conn, "DELETE FROM `MediaSource` WHERE retentionUntil IS NOT NULL AND retentionUntil < NOW(3)"));
}

export async function getFavoriteChronology(conn: Connection, kind: FavoriteKind, site: KimonoSite): Promise<FavoriteChronologyRow[]> {
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

export async function upsertFavoriteChronologyEntry(conn: Connection, entry: FavoriteChronologyRow): Promise<void> {
  return withDbLog("upsertFavoriteChronologyEntry", { kind: entry.kind, site: entry.site, service: entry.service, creatorId: entry.creatorId }, async () => {
    const hasFavedSeq = await hasFavoriteChronologyFavedSeq(conn);
    if (hasFavedSeq) {
      await executeResult(conn, "INSERT INTO `FavoriteChronology` (kind, site, service, creatorId, postId, favoritedAt, lastConfirmedAt, favedSeq) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE favoritedAt = COALESCE(`FavoriteChronology`.favoritedAt, VALUES(favoritedAt)), lastConfirmedAt = VALUES(lastConfirmedAt), favedSeq = COALESCE(`FavoriteChronology`.favedSeq, VALUES(favedSeq))", [entry.kind, entry.site, entry.service, entry.creatorId, entry.postId ?? "", entry.favoritedAt, entry.lastConfirmedAt, entry.favedSeq]);
      return;
    }

    await executeResult(conn, "INSERT INTO `FavoriteChronology` (kind, site, service, creatorId, postId, favoritedAt, lastConfirmedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE favoritedAt = COALESCE(`FavoriteChronology`.favoritedAt, VALUES(favoritedAt)), lastConfirmedAt = VALUES(lastConfirmedAt)", [entry.kind, entry.site, entry.service, entry.creatorId, entry.postId ?? "", entry.favoritedAt, entry.lastConfirmedAt]);
  });
}

export async function deleteFavoriteChronologyEntry(conn: Connection, kind: FavoriteKind, site: KimonoSite, service: string, creatorId: string, postId = ""): Promise<void> {
  return withDbLog("deleteFavoriteChronologyEntry", { kind, site, service, creatorId, postId }, async () => {
    await executeResult(conn, "DELETE FROM `FavoriteChronology` WHERE kind = ? AND site = ? AND service = ? AND creatorId = ? AND postId = ?", [kind, site, service, creatorId, postId]);
  });
}

export async function getFavoriteCache(conn: Connection, kind: FavoriteKind, site: KimonoSite): Promise<FavoriteCacheRow | null> {
  return withDbLog("getFavoriteCache", { kind, site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `FavoriteCache` WHERE kind = ? AND site = ? LIMIT 1", [kind, site]);
    return rows[0] ? mapFavoriteCacheRow(rows[0]) : null;
  });
}

export async function upsertFavoriteCache(conn: Connection, entry: FavoriteCacheRow): Promise<void> {
  return withDbLog("upsertFavoriteCache", { kind: entry.kind, site: entry.site }, async () => {
    await executeResult(conn, "INSERT INTO `FavoriteCache` (kind, site, payloadJson, updatedAt, expiresAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE payloadJson = VALUES(payloadJson), updatedAt = VALUES(updatedAt), expiresAt = VALUES(expiresAt)", [entry.kind, entry.site, entry.payloadJson, entry.updatedAt, entry.expiresAt]);
  });
}

export async function getDiscoveryCache(conn: Connection, site: KimonoSite | "global"): Promise<DiscoveryCacheRow | null> {
  return withDbLog("getDiscoveryCache", { site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `DiscoveryCache` WHERE site = ? LIMIT 1", [site]);
    return rows[0] ? mapDiscoveryCacheRow(rows[0]) : null;
  });
}

export async function upsertDiscoveryCache(conn: Connection, entry: DiscoveryCacheRow): Promise<void> {
  return withDbLog("upsertDiscoveryCache", { site: entry.site }, async () => {
    await executeResult(conn, "INSERT INTO `DiscoveryCache` (site, payloadJson, updatedAt, expiresAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE payloadJson = VALUES(payloadJson), updatedAt = VALUES(updatedAt), expiresAt = VALUES(expiresAt)", [entry.site, entry.payloadJson, entry.updatedAt, entry.expiresAt]);
  });
}

export async function getDiscoveryBlocks(conn: Connection, site: KimonoSite): Promise<DiscoveryBlockRow[]> {
  return withDbLog("getDiscoveryBlocks", { site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `DiscoveryBlock` WHERE site = ? ORDER BY blockedAt DESC", [site]);
    return rows.map((row) => mapDiscoveryBlockRow(row));
  });
}

export async function upsertDiscoveryBlock(conn: Connection, block: DiscoveryBlockRow): Promise<void> {
  return withDbLog("upsertDiscoveryBlock", { site: block.site, service: block.service, creatorId: block.creatorId }, async () => {
    await executeResult(conn, "INSERT INTO `DiscoveryBlock` (site, service, creatorId, blockedAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE blockedAt = VALUES(blockedAt)", [block.site, block.service, block.creatorId, block.blockedAt]);
  });
}

export async function deleteDiscoveryBlock(conn: Connection, site: KimonoSite, service: string, creatorId: string): Promise<void> {
  return withDbLog("deleteDiscoveryBlock", { site, service, creatorId }, async () => {
    await executeResult(conn, "DELETE FROM `DiscoveryBlock` WHERE site = ? AND service = ? AND creatorId = ?", [site, service, creatorId]);
  });
}

export async function getLatestKimonoSession(conn: Connection, site: KimonoSite): Promise<KimonoSessionRow | null> {
  return withDbLog("getLatestKimonoSession", { site }, async () => {
    const rows = await queryRows(conn, "SELECT * FROM `KimonoSession` WHERE site = ? ORDER BY savedAt DESC LIMIT 1", [site]);
    return rows[0] ? mapKimonoSessionRow(rows[0]) : null;
  });
}

export async function upsertKimonoSession(conn: Connection, session: KimonoSessionRow): Promise<void> {
  return withDbLog("upsertKimonoSession", { site: session.site, username: session.username }, async () => {
    await executeResult(conn, "INSERT INTO `KimonoSession` (id, site, cookie, username, savedAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = VALUES(id), cookie = VALUES(cookie), username = VALUES(username), savedAt = VALUES(savedAt)", [session.id, session.site, session.cookie, session.username, session.savedAt]);
  });
}

export async function deleteKimonoSession(conn: Connection, site: KimonoSite): Promise<void> {
  return withDbLog("deleteKimonoSession", { site }, async () => {
    await executeResult(conn, "DELETE FROM `KimonoSession` WHERE site = ?", [site]);
  });
}







