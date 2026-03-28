import type mysql from "mysql2/promise";

import { isLocalDevMode } from "../local-dev-mode.ts";
import {
  CREATOR_SNAPSHOT_TTL_MS,
  POPULAR_SNAPSHOT_TTL_MS,
  getRelevantSearchSites,
  isSnapshotFresh,
  normalizeCreatorName,
  parseLikedCreatorKey,
  type PopularPeriod,
  type SearchCreatorsPageParams,
} from "./performance-cache.ts";

export type Site = "kemono" | "coomer";

export interface CreatorSnapshotInput {
  site: Site;
  service: string;
  creatorId: string;
  name: string;
  favorited?: number | null;
  updated?: string | Date | null;
  indexed?: string | Date | null;
  profileImageUrl?: string | null;
  bannerImageUrl?: string | null;
  publicId?: string | null;
  postCount?: number | null;
  rawPreviewPayload?: unknown;
}

export interface SearchCreatorRecord {
  id: string;
  site: Site;
  service: string;
  name: string;
  favorited: number | null;
  updated: string | null;
  indexed: string | null;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  publicId: string | null;
  postCount: number | null;
  rawPreviewPayload: unknown | null;
  syncedAt: Date;
}

export interface SearchCreatorsPageResult {
  items: SearchCreatorRecord[];
  total: number;
  page: number;
  perPage: number;
  services: string[];
  snapshotFresh: boolean;
  syncedAt: Date | null;
}

export interface PostCacheInput {
  site: Site;
  service: string;
  creatorId: string;
  postId: string;
  title?: string | null;
  excerpt?: string | null;
  publishedAt?: string | Date | null;
  addedAt?: string | Date | null;
  editedAt?: string | Date | null;
  previewImageUrl?: string | null;
  videoUrl?: string | null;
  thumbUrl?: string | null;
  mediaType?: string | null;
  authorName?: string | null;
  rawPreviewPayload?: unknown;
  rawDetailPayload?: unknown;
  detailLevel: "metadata" | "full";
  sourceKind: string;
  longestVideoUrl?: string | null;
  longestVideoDurationSeconds?: number | null;
  previewThumbnailAssetPath?: string | null;
  previewClipAssetPath?: string | null;
  previewStatus?: string | null;
  previewGeneratedAt?: string | Date | null;
  previewError?: string | null;
  previewSourceFingerprint?: string | null;
  cachedAt: Date;
  expiresAt: Date;
}

export interface PostCacheRecord {
  site: Site;
  service: string;
  creatorId: string;
  postId: string;
  title: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  addedAt: Date | null;
  editedAt: Date | null;
  previewImageUrl: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
  mediaType: string | null;
  authorName: string | null;
  rawPreviewPayload: unknown | null;
  rawDetailPayload: unknown | null;
  detailLevel: "metadata" | "full";
  sourceKind: string;
  longestVideoUrl: string | null;
  longestVideoDurationSeconds: number | null;
  previewThumbnailAssetPath: string | null;
  previewClipAssetPath: string | null;
  previewStatus: string | null;
  previewGeneratedAt: Date | null;
  previewError: string | null;
  previewSourceFingerprint: string | null;
  cachedAt: Date;
  expiresAt: Date;
}

export interface PreviewAssetCacheInput {
  site: Site;
  sourceVideoUrl: string;
  sourceFingerprint: string;
  durationSeconds?: number | null;
  thumbnailAssetPath?: string | null;
  clipAssetPath?: string | null;
  status: string;
  generatedAt: Date;
  lastSeenAt: Date;
  error?: string | null;
  mediaKind?: "image" | "video" | "unknown" | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  nativeThumbnailUrl?: string | null;
  probeStatus?: string | null;
  artifactStatus?: string | null;
  firstSeenAt?: Date | null;
  hotUntil?: Date | null;
  retryAfter?: Date | null;
  generationAttempts?: number | null;
  lastError?: string | null;
  lastObservedContext?: string | null;
}

export interface PreviewAssetCacheRecord {
  site: Site;
  sourceVideoUrl: string;
  sourceFingerprint: string;
  durationSeconds: number | null;
  thumbnailAssetPath: string | null;
  clipAssetPath: string | null;
  status: string;
  generatedAt: Date;
  lastSeenAt: Date;
  error: string | null;
  mediaKind: "image" | "video" | "unknown" | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  nativeThumbnailUrl: string | null;
  probeStatus: string | null;
  artifactStatus: string | null;
  firstSeenAt: Date | null;
  hotUntil: Date | null;
  retryAfter: Date | null;
  generationAttempts: number | null;
  lastError: string | null;
  lastObservedContext: string | null;
}

export type MediaSourcePriorityClass = "regular" | "popular" | "liked" | "playback";

export interface MediaSourceCacheInput {
  site: Site;
  sourceVideoUrl: string;
  sourceFingerprint: string;
  localVideoPath?: string | null;
  downloadStatus: string;
  downloadedAt?: Date | null;
  lastSeenAt: Date;
  retentionUntil?: Date | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  downloadError?: string | null;
  downloadAttempts?: number | null;
  lastObservedContext?: string | null;
  priorityClass?: MediaSourcePriorityClass | null;
  retryAfter?: Date | null;
  firstSeenAt?: Date | null;
}

export interface MediaSourceCacheRecord {
  site: Site;
  sourceVideoUrl: string;
  sourceFingerprint: string;
  localVideoPath: string | null;
  downloadStatus: string;
  downloadedAt: Date | null;
  lastSeenAt: Date;
  retentionUntil: Date | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  downloadError: string | null;
  downloadAttempts: number | null;
  lastObservedContext: string | null;
  priorityClass: MediaSourcePriorityClass | null;
  retryAfter: Date | null;
  firstSeenAt: Date | null;
}

export interface PreviewAssetStats {
  totalEntries: number;
  readyEntries: number;
  partialEntries: number;
  failedEntries: number;
}

export interface MediaSourceCacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  readyEntries: number;
  remoteHttpErrors: number;
  toolMissing: number;
}

export type CreatorSearchCacheMedia = "all" | "images" | "videos";

export interface CreatorSearchCachePayload {
  posts: unknown[];
  total: number;
  page: number;
  perPage: number;
  hasNextPage: boolean;
  scannedPages: number;
  truncated: boolean;
  source: string;
  cache?: {
    hit: boolean;
    stale: boolean;
    ttlSeconds: number;
  } | null;
}

export interface CreatorSearchCacheInput {
  site: Site;
  service: string;
  creatorId: string;
  normalizedQuery: string;
  media: CreatorSearchCacheMedia;
  page: number;
  perPage: number;
  payload: CreatorSearchCachePayload;
  cachedAt: Date;
  expiresAt: Date;
}

export interface CreatorSearchCacheRecord {
  site: Site;
  service: string;
  creatorId: string;
  normalizedQuery: string;
  media: CreatorSearchCacheMedia;
  page: number;
  perPage: number;
  payload: CreatorSearchCachePayload;
  cachedAt: Date;
  expiresAt: Date;
}

export interface PopularSnapshotInput {
  site: Site;
  period: PopularPeriod;
  rangeDate: string | null;
  pageOffset: number;
  snapshotDate: string;
  posts: Array<{
    rank: number;
    site: Site;
    service: string;
    creatorId: string;
    postId: string;
  }>;
}

export interface PopularSnapshotResult {
  posts: PostCacheRecord[];
  snapshotFresh: boolean;
  snapshotDate: string | null;
  syncedAt: Date | null;
}

export interface PerformanceRepository {
  replaceCreatorSnapshot(input: { site: Site; syncedAt: Date; creators: CreatorSnapshotInput[] }): Promise<void>;
  upsertCreatorProfile(input: CreatorSnapshotInput & { syncedAt?: Date }): Promise<void>;
  getCreatorProfile(input: { site: Site; service: string; creatorId: string }): Promise<SearchCreatorRecord | null>;
  searchCreatorsPage(input: SearchCreatorsPageParams): Promise<SearchCreatorsPageResult>;
  upsertPostCache(input: PostCacheInput): Promise<void>;
  getPostCache(input: { site: Site; service: string; creatorId: string; postId: string }): Promise<PostCacheRecord | null>;
  listCreatorPosts(input: { site: Site; service: string; creatorId: string; offset: number; limit: number; freshOnly: boolean; now?: Date }): Promise<PostCacheRecord[]>;
  replacePopularSnapshot(input: PopularSnapshotInput): Promise<void>;
  getPopularSnapshot(input: { site: Site; period: PopularPeriod; rangeDate: string | null; pageOffset: number; now?: Date }): Promise<PopularSnapshotResult>;
  getPreviewAssetCache(input: { site: Site; sourceFingerprint: string }): Promise<PreviewAssetCacheRecord | null>;
  upsertPreviewAssetCache(input: PreviewAssetCacheInput): Promise<void>;
  touchPreviewAssetCache(input: { site: Site; sourceFingerprint: string; lastSeenAt: Date }): Promise<void>;
  listPreviewAssetCachesOlderThan(input: { cutoff: Date }): Promise<PreviewAssetCacheRecord[]>;
  deletePreviewAssetCaches(input: { entries: Array<{ site: Site; sourceFingerprint: string }> }): Promise<void>;
  getPreviewAssetStats(): Promise<PreviewAssetStats>;
  getMediaSourceCache(input: { site: Site; sourceFingerprint: string }): Promise<MediaSourceCacheRecord | null>;
  upsertMediaSourceCache(input: MediaSourceCacheInput): Promise<void>;
  touchMediaSourceCache(input: {
    site: Site;
    sourceFingerprint: string;
    lastSeenAt: Date;
    retentionUntil?: Date | null;
    priorityClass?: MediaSourcePriorityClass | null;
  }): Promise<void>;
  listExpiredMediaSourceCaches(input: { cutoff: Date }): Promise<MediaSourceCacheRecord[]>;
  deleteMediaSourceCaches(input: { entries: Array<{ site: Site; sourceFingerprint: string }> }): Promise<void>;
  getMediaSourceCacheStats(): Promise<MediaSourceCacheStats>;
  getCreatorSearchCache(input: { site: Site; service: string; creatorId: string; normalizedQuery: string; media: CreatorSearchCacheMedia; page: number; perPage: number }): Promise<CreatorSearchCacheRecord | null>;
  upsertCreatorSearchCache(input: CreatorSearchCacheInput): Promise<void>;
  listActivePreviewSourceFingerprints(input: { snapshotDateFrom: string }): Promise<Array<{ site: Site; sourceFingerprint: string }>>;
  deletePopularSnapshotsOlderThan(input: { snapshotDateBefore: string }): Promise<void>;
  disconnect(): Promise<void>;
}

type LocalPrismaQueryClient = {
  $queryRawUnsafe<T = any>(sql: string, ...values: any[]): Promise<T[]>;
  $executeRawUnsafe(sql: string, ...values: any[]): Promise<unknown>;
  $transaction<T>(fn: (tx: LocalPrismaQueryClient) => Promise<T>): Promise<T>;
  $disconnect(): Promise<void>;
};

interface DatabaseDriver {
  kind: "sqlite" | "mysql";
  query<T = any>(sql: string, values?: any[]): Promise<T[]>;
  execute(sql: string, values?: any[]): Promise<void>;
  transaction<T>(fn: (driver: DatabaseDriver) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
}

const globalPerfRepository = globalThis as typeof globalThis & {
  __kimonoPerfRepository?: PerformanceRepository;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapCreatorRow(row: any): SearchCreatorRecord {
  const rawPreviewPayload = parseJson(row.rawPreviewPayload);
  const rawHasFavorited = Boolean(
    rawPreviewPayload
    && typeof rawPreviewPayload === "object"
    && Object.prototype.hasOwnProperty.call(rawPreviewPayload, "favorited")
  );
  const favorited = row.favorited === null || row.favorited === undefined
    ? null
    : Number(row.favorited);

  return {
    id: String(row.creatorId ?? row.id),
    site: row.site as Site,
    service: String(row.service),
    name: String(row.name),
    favorited: favorited === 0 && !rawHasFavorited ? null : favorited,
    updated: toDate(row.updatedAt)?.toISOString() ?? null,
    indexed: toDate(row.indexedAt)?.toISOString() ?? null,
    profileImageUrl: row.profileImageUrl ?? null,
    bannerImageUrl: row.bannerImageUrl ?? null,
    publicId: row.publicId ?? null,
    postCount: row.postCount === null || row.postCount === undefined ? null : Number(row.postCount),
    rawPreviewPayload,
    syncedAt: toDate(row.syncedAt) ?? new Date(0),
  };
}

function mapPostRow(row: any): PostCacheRecord {
  return {
    site: row.site as Site,
    service: String(row.service),
    creatorId: String(row.creatorId),
    postId: String(row.postId),
    title: row.title ?? null,
    excerpt: row.excerpt ?? null,
    publishedAt: toDate(row.publishedAt),
    addedAt: toDate(row.addedAt),
    editedAt: toDate(row.editedAt),
    previewImageUrl: row.previewImageUrl ?? null,
    videoUrl: row.videoUrl ?? null,
    thumbUrl: row.thumbUrl ?? null,
    mediaType: row.mediaType ?? null,
    authorName: row.authorName ?? null,
    rawPreviewPayload: parseJson(row.rawPreviewPayload),
    rawDetailPayload: parseJson(row.rawDetailPayload),
    detailLevel: row.detailLevel === "full" ? "full" : "metadata",
    sourceKind: String(row.sourceKind ?? "live"),
    longestVideoUrl: row.longestVideoUrl ?? null,
    longestVideoDurationSeconds:
      row.longestVideoDurationSeconds === null || row.longestVideoDurationSeconds === undefined
        ? null
        : Number(row.longestVideoDurationSeconds),
    previewThumbnailAssetPath: row.previewThumbnailAssetPath ?? null,
    previewClipAssetPath: row.previewClipAssetPath ?? null,
    previewStatus: row.previewStatus ?? null,
    previewGeneratedAt: toDate(row.previewGeneratedAt),
    previewError: row.previewError ?? null,
    previewSourceFingerprint: row.previewSourceFingerprint ?? null,
    cachedAt: toDate(row.cachedAt) ?? new Date(0),
    expiresAt: toDate(row.expiresAt) ?? new Date(0),
  };
}

function mapPreviewAssetRow(row: any): PreviewAssetCacheRecord {
  return {
    site: row.site as Site,
    sourceVideoUrl: String(row.sourceVideoUrl),
    sourceFingerprint: String(row.sourceFingerprint),
    durationSeconds:
      row.durationSeconds === null || row.durationSeconds === undefined
        ? null
        : Number(row.durationSeconds),
    thumbnailAssetPath: row.thumbnailAssetPath ?? null,
    clipAssetPath: row.clipAssetPath ?? null,
    status: String(row.status ?? "pending"),
    generatedAt: toDate(row.generatedAt) ?? new Date(0),
    lastSeenAt: toDate(row.lastSeenAt) ?? new Date(0),
    error: row.error ?? null,
    mediaKind: row.mediaKind ?? null,
    mimeType: row.mimeType ?? null,
    width:
      row.width === null || row.width === undefined
        ? null
        : Number(row.width),
    height:
      row.height === null || row.height === undefined
        ? null
        : Number(row.height),
    nativeThumbnailUrl: row.nativeThumbnailUrl ?? null,
    probeStatus: row.probeStatus ?? null,
    artifactStatus: row.artifactStatus ?? null,
    firstSeenAt: toDate(row.firstSeenAt),
    hotUntil: toDate(row.hotUntil),
    retryAfter: toDate(row.retryAfter),
    generationAttempts:
      row.generationAttempts === null || row.generationAttempts === undefined
        ? null
        : Number(row.generationAttempts),
    lastError: row.lastError ?? null,
    lastObservedContext: row.lastObservedContext ?? null,
  };
}

function mapMediaSourceRow(row: any): MediaSourceCacheRecord {
  return {
    site: row.site as Site,
    sourceVideoUrl: String(row.sourceVideoUrl),
    sourceFingerprint: String(row.sourceFingerprint),
    localVideoPath: row.localVideoPath ?? null,
    downloadStatus: String(row.downloadStatus ?? "pending"),
    downloadedAt: toDate(row.downloadedAt),
    lastSeenAt: toDate(row.lastSeenAt) ?? new Date(0),
    retentionUntil: toDate(row.retentionUntil),
    fileSizeBytes:
      row.fileSizeBytes === null || row.fileSizeBytes === undefined
        ? null
        : Number(row.fileSizeBytes),
    mimeType: row.mimeType ?? null,
    downloadError: row.downloadError ?? null,
    downloadAttempts:
      row.downloadAttempts === null || row.downloadAttempts === undefined
        ? null
        : Number(row.downloadAttempts),
    lastObservedContext: row.lastObservedContext ?? null,
    priorityClass:
      row.priorityClass === "regular" || row.priorityClass === "popular" || row.priorityClass === "liked" || row.priorityClass === "playback"
        ? row.priorityClass
        : null,
    retryAfter: toDate(row.retryAfter),
    firstSeenAt: toDate(row.firstSeenAt),
  };
}

function mapCreatorSearchCacheRow(row: any): CreatorSearchCacheRecord {
  return {
    site: row.site as Site,
    service: String(row.service),
    creatorId: String(row.creatorId),
    normalizedQuery: String(row.normalizedQuery ?? ""),
    media: row.media === "images" || row.media === "videos" ? row.media : "all",
    page: Number(row.page ?? 1),
    perPage: Number(row.perPage ?? 50),
    payload: parseJson<CreatorSearchCachePayload>(row.payloadJson) ?? {
      posts: [],
      total: 0,
      page: Number(row.page ?? 1),
      perPage: Number(row.perPage ?? 50),
      hasNextPage: false,
      scannedPages: 0,
      truncated: false,
      source: "cache",
      cache: null,
    },
    cachedAt: toDate(row.cachedAt) ?? new Date(0),
    expiresAt: toDate(row.expiresAt) ?? new Date(0),
  };
}

function getSearchWhere(input: SearchCreatorsPageParams) {
  const normalizedQuery = normalizeCreatorName(input.q);
  const relevantSites = getRelevantSearchSites(input.filter, input.likedCreatorKeys ?? []);
  const likedEntries = (input.likedCreatorKeys ?? [])
    .map(parseLikedCreatorKey)
    .filter((value): value is NonNullable<ReturnType<typeof parseLikedCreatorKey>> => Boolean(value));
  const clauses: string[] = [];
  const values: any[] = [];

  if (relevantSites.length === 1) {
    clauses.push("site = ?");
    values.push(relevantSites[0]);
  } else if (relevantSites.length > 1) {
    clauses.push(`site IN (${relevantSites.map(() => "?").join(", ")})`);
    values.push(...relevantSites);
  }

  if (input.service !== "Tous") {
    clauses.push("service = ?");
    values.push(input.service);
  }

  if (normalizedQuery) {
    clauses.push("normalizedName LIKE ?");
    values.push(`%${normalizedQuery}%`);
  }

  if (input.filter === "liked") {
    if (likedEntries.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`(${likedEntries.map(() => "(site = ? AND service = ? AND creatorId = ?)").join(" OR ")})`);
      for (const entry of likedEntries) {
        values.push(entry.site, entry.service, entry.creatorId);
      }
    }
  }

  return {
    relevantSites,
    likedEntries,
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function getSearchOrderSql(sort: SearchCreatorsPageParams["sort"]): string {
  switch (sort) {
    case "date":
      return "CASE WHEN updatedAt IS NULL THEN 1 ELSE 0 END ASC, updatedAt DESC, indexedAt DESC, favorited DESC, name ASC";
    case "az":
      return "name ASC";
    case "favorites":
    default:
      return "favorited DESC, name ASC";
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function bulkValuesSql(columnCount: number, rowCount: number): string {
  return Array.from({ length: rowCount }, () => `(${Array.from({ length: columnCount }, () => "?").join(", ")})`).join(", ");
}

function flattenRows(rows: any[][]): any[] {
  return rows.flat();
}

function createSqliteDriver(prisma: LocalPrismaQueryClient): DatabaseDriver {
  const prismaAny = prisma as any;
  return {
    kind: "sqlite",
    async query(sql, values = []) {
      return prismaAny.$queryRawUnsafe(sql, ...values);
    },
    async execute(sql, values = []) {
      await prismaAny.$executeRawUnsafe(sql, ...values);
    },
    async transaction(fn) {
      return prismaAny.$transaction(async (tx: any) => fn(createSqliteDriver(tx)));
    },
    async disconnect() {
      await prismaAny.$disconnect();
    },
  };
}

function createMysqlDriver(): DatabaseDriver {
  return {
    kind: "mysql",
    async query(sql, values = []) {
      const db = await import("../db.ts");
      return db.query(sql, values);
    },
    async execute(sql, values = []) {
      const db = await import("../db.ts");
      await db.execute(sql, values);
    },
    async transaction(fn) {
      const { pool } = await import("../db.ts");
      const connection = await pool.getConnection();
      const driver: DatabaseDriver = {
        kind: "mysql",
        async query(sql, values = []) {
          const [rows] = await connection.execute(sql, values);
          return rows as any[];
        },
        async execute(sql, values = []) {
          await connection.execute(sql, values);
        },
        async transaction(inner) {
          return inner(driver);
        },
        async disconnect() {
          connection.release();
        },
      };

      try {
        await connection.beginTransaction();
        const result = await fn(driver);
        await connection.commit();
        connection.release();
        return result;
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    },
    async disconnect() {
      return Promise.resolve();
    },
  };
}

async function ensureSqliteColumn(driver: DatabaseDriver, table: string, columnDefinition: string) {
  try {
    await driver.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name/i.test(message)) {
      throw error;
    }
  }
}

async function ensureMySqlColumn(driver: DatabaseDriver, table: string, columnDefinition: string) {
  await driver.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnDefinition}`);
}

async function ensurePerformanceTables(driver: DatabaseDriver): Promise<void> {
  if (driver.kind === "mysql") {
    await driver.execute(`
      CREATE TABLE IF NOT EXISTS CreatorIndex (
        site VARCHAR(32) NOT NULL,
        service VARCHAR(191) NOT NULL,
        creatorId VARCHAR(191) NOT NULL,
        name VARCHAR(191) NOT NULL,
        normalizedName VARCHAR(191) NOT NULL,
        favorited INT NOT NULL DEFAULT 0,
        updatedAt DATETIME(3) NULL,
        indexedAt DATETIME(3) NULL,
        profileImageUrl TEXT NULL,
        bannerImageUrl TEXT NULL,
        publicId VARCHAR(191) NULL,
        postCount INT NULL,
        rawPreviewPayload LONGTEXT NULL,
        syncedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (site, service, creatorId),
        KEY CreatorIndex_normalizedName_idx (normalizedName),
        KEY CreatorIndex_site_syncedAt_idx (site, syncedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await driver.execute(`
      CREATE TABLE IF NOT EXISTS PostCache (
        site VARCHAR(32) NOT NULL,
        service VARCHAR(191) NOT NULL,
        creatorId VARCHAR(191) NOT NULL,
        postId VARCHAR(191) NOT NULL,
        title TEXT NULL,
        excerpt LONGTEXT NULL,
        publishedAt DATETIME(3) NULL,
        addedAt DATETIME(3) NULL,
        editedAt DATETIME(3) NULL,
        previewImageUrl TEXT NULL,
        videoUrl TEXT NULL,
        thumbUrl TEXT NULL,
        mediaType VARCHAR(32) NULL,
        authorName VARCHAR(191) NULL,
        rawPreviewPayload LONGTEXT NULL,
        rawDetailPayload LONGTEXT NULL,
        detailLevel VARCHAR(32) NOT NULL DEFAULT 'metadata',
        sourceKind VARCHAR(64) NOT NULL DEFAULT 'live',
        longestVideoUrl TEXT NULL,
        longestVideoDurationSeconds DOUBLE NULL,
        previewThumbnailAssetPath TEXT NULL,
        previewClipAssetPath TEXT NULL,
        previewStatus VARCHAR(64) NULL,
        previewGeneratedAt DATETIME(3) NULL,
        previewError LONGTEXT NULL,
        previewSourceFingerprint VARCHAR(191) NULL,
        cachedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        expiresAt DATETIME(3) NOT NULL,
        PRIMARY KEY (site, service, creatorId, postId),
        KEY PostCache_creator_idx (site, service, creatorId, publishedAt),
        KEY PostCache_expiresAt_idx (expiresAt),
        KEY PostCache_previewSourceFingerprint_idx (site, previewSourceFingerprint)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    for (const column of [
      "longestVideoUrl TEXT NULL",
      "longestVideoDurationSeconds DOUBLE NULL",
      "previewThumbnailAssetPath TEXT NULL",
      "previewClipAssetPath TEXT NULL",
      "previewStatus VARCHAR(64) NULL",
      "previewGeneratedAt DATETIME(3) NULL",
      "previewError LONGTEXT NULL",
      "previewSourceFingerprint VARCHAR(191) NULL",
    ]) {
      await ensureMySqlColumn(driver, "PostCache", column);
    }
    await driver.execute(`CREATE INDEX IF NOT EXISTS PostCache_previewSourceFingerprint_idx ON PostCache(site, previewSourceFingerprint)`);
    await driver.execute(`
      CREATE TABLE IF NOT EXISTS PreviewAssetCache (
        site VARCHAR(32) NOT NULL,
        sourceVideoUrl TEXT NOT NULL,
        sourceFingerprint VARCHAR(191) NOT NULL,
        durationSeconds DOUBLE NULL,
        thumbnailAssetPath TEXT NULL,
        clipAssetPath TEXT NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'pending',
        generatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        lastSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        error LONGTEXT NULL,
        PRIMARY KEY (site, sourceFingerprint),
        KEY PreviewAssetCache_lastSeenAt_idx (lastSeenAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    for (const column of [
      "mediaKind VARCHAR(32) NULL",
      "mimeType VARCHAR(191) NULL",
      "width INT NULL",
      "height INT NULL",
      "nativeThumbnailUrl TEXT NULL",
      "probeStatus VARCHAR(64) NULL",
      "artifactStatus VARCHAR(64) NULL",
      "firstSeenAt DATETIME(3) NULL",
      "hotUntil DATETIME(3) NULL",
      "retryAfter DATETIME(3) NULL",
      "generationAttempts INT NULL",
      "lastError LONGTEXT NULL",
      "lastObservedContext VARCHAR(191) NULL",
    ]) {
      await ensureMySqlColumn(driver, "PreviewAssetCache", column);
    }
    await driver.execute(`
      CREATE TABLE IF NOT EXISTS MediaSourceCache (
        site VARCHAR(32) NOT NULL,
        sourceVideoUrl TEXT NOT NULL,
        sourceFingerprint VARCHAR(191) NOT NULL,
        localVideoPath TEXT NULL,
        downloadStatus VARCHAR(64) NOT NULL DEFAULT 'pending',
        downloadedAt DATETIME(3) NULL,
        lastSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        retentionUntil DATETIME(3) NULL,
        fileSizeBytes BIGINT NULL,
        mimeType VARCHAR(191) NULL,
        downloadError LONGTEXT NULL,
        downloadAttempts INT NULL,
        lastObservedContext VARCHAR(191) NULL,
        priorityClass VARCHAR(32) NULL,
        retryAfter DATETIME(3) NULL,
        firstSeenAt DATETIME(3) NULL,
        PRIMARY KEY (site, sourceFingerprint),
        KEY MediaSourceCache_lastSeenAt_idx (lastSeenAt),
        KEY MediaSourceCache_retentionUntil_idx (retentionUntil),
        KEY MediaSourceCache_priorityClass_idx (priorityClass)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    for (const column of [
      "localVideoPath TEXT NULL",
      "downloadStatus VARCHAR(64) NOT NULL DEFAULT 'pending'",
      "downloadedAt DATETIME(3) NULL",
      "lastSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
      "retentionUntil DATETIME(3) NULL",
      "fileSizeBytes BIGINT NULL",
      "mimeType VARCHAR(191) NULL",
      "downloadError LONGTEXT NULL",
      "downloadAttempts INT NULL",
      "lastObservedContext VARCHAR(191) NULL",
      "priorityClass VARCHAR(32) NULL",
      "retryAfter DATETIME(3) NULL",
      "firstSeenAt DATETIME(3) NULL"
    ]) {
      await ensureMySqlColumn(driver, "MediaSourceCache", column);
    }
    await driver.execute(`CREATE INDEX IF NOT EXISTS MediaSourceCache_lastSeenAt_idx ON MediaSourceCache(lastSeenAt)`);
    await driver.execute(`CREATE INDEX IF NOT EXISTS MediaSourceCache_retentionUntil_idx ON MediaSourceCache(retentionUntil)`);
    await driver.execute(`CREATE INDEX IF NOT EXISTS MediaSourceCache_priorityClass_idx ON MediaSourceCache(priorityClass)`);
    await driver.execute(`
      CREATE TABLE IF NOT EXISTS CreatorSearchCache (
        site VARCHAR(32) NOT NULL,
        service VARCHAR(191) NOT NULL,
        creatorId VARCHAR(191) NOT NULL,
        normalizedQuery VARCHAR(255) NOT NULL DEFAULT '',
        media VARCHAR(32) NOT NULL DEFAULT 'all',
        page INT NOT NULL,
        perPage INT NOT NULL,
        payloadJson LONGTEXT NOT NULL,
        cachedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        expiresAt DATETIME(3) NOT NULL,
        PRIMARY KEY (site, service, creatorId, normalizedQuery, media, page, perPage),
        KEY CreatorSearchCache_expiresAt_idx (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await driver.execute(`CREATE INDEX IF NOT EXISTS CreatorSearchCache_expiresAt_idx ON CreatorSearchCache(expiresAt)`);
    await driver.execute(`
      CREATE TABLE IF NOT EXISTS PopularSnapshot (
        snapshotRunId VARCHAR(191) NOT NULL,
        rank INT NOT NULL,
        site VARCHAR(32) NOT NULL,
        period VARCHAR(32) NOT NULL,
        rangeKey VARCHAR(32) NOT NULL DEFAULT '',
        pageOffset INT NOT NULL DEFAULT 0,
        snapshotDate VARCHAR(32) NOT NULL,
        syncedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        postSite VARCHAR(32) NOT NULL,
        postService VARCHAR(191) NOT NULL,
        creatorId VARCHAR(191) NOT NULL,
        postId VARCHAR(191) NOT NULL,
        PRIMARY KEY (snapshotRunId, rank),
        KEY PopularSnapshot_lookup_idx (site, period, rangeKey, pageOffset, syncedAt),
        KEY PopularSnapshot_snapshotDate_idx (snapshotDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await driver.execute(`CREATE INDEX IF NOT EXISTS PopularSnapshot_snapshotDate_idx ON PopularSnapshot(snapshotDate)`);
    return;
  }

  await driver.execute(`
    CREATE TABLE IF NOT EXISTS CreatorIndex (
      site VARCHAR(32) NOT NULL,
      service VARCHAR(191) NOT NULL,
      creatorId VARCHAR(191) NOT NULL,
      name VARCHAR(191) NOT NULL,
      normalizedName VARCHAR(191) NOT NULL,
      favorited INT NOT NULL DEFAULT 0,
      updatedAt DATETIME NULL,
      indexedAt DATETIME NULL,
      profileImageUrl TEXT NULL,
      bannerImageUrl TEXT NULL,
      publicId VARCHAR(191) NULL,
      postCount INT NULL,
      rawPreviewPayload LONGTEXT NULL,
      syncedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (site, service, creatorId)
    )
  `);
  await driver.execute(`CREATE INDEX IF NOT EXISTS CreatorIndex_normalizedName_idx ON CreatorIndex(normalizedName)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS CreatorIndex_site_syncedAt_idx ON CreatorIndex(site, syncedAt)`);
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS PostCache (
      site VARCHAR(32) NOT NULL,
      service VARCHAR(191) NOT NULL,
      creatorId VARCHAR(191) NOT NULL,
      postId VARCHAR(191) NOT NULL,
      title TEXT NULL,
      excerpt LONGTEXT NULL,
      publishedAt DATETIME NULL,
      addedAt DATETIME NULL,
      editedAt DATETIME NULL,
      previewImageUrl TEXT NULL,
      videoUrl TEXT NULL,
      thumbUrl TEXT NULL,
      mediaType VARCHAR(32) NULL,
      authorName VARCHAR(191) NULL,
      rawPreviewPayload LONGTEXT NULL,
      rawDetailPayload LONGTEXT NULL,
      detailLevel VARCHAR(32) NOT NULL DEFAULT 'metadata',
      sourceKind VARCHAR(64) NOT NULL DEFAULT 'live',
      longestVideoUrl TEXT NULL,
      longestVideoDurationSeconds REAL NULL,
      previewThumbnailAssetPath TEXT NULL,
      previewClipAssetPath TEXT NULL,
      previewStatus VARCHAR(64) NULL,
      previewGeneratedAt DATETIME NULL,
      previewError TEXT NULL,
      previewSourceFingerprint VARCHAR(191) NULL,
      cachedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL,
      PRIMARY KEY (site, service, creatorId, postId)
    )
  `);
  for (const column of [
    "longestVideoUrl TEXT NULL",
    "longestVideoDurationSeconds REAL NULL",
    "previewThumbnailAssetPath TEXT NULL",
    "previewClipAssetPath TEXT NULL",
    "previewStatus VARCHAR(64) NULL",
    "previewGeneratedAt DATETIME NULL",
    "previewError TEXT NULL",
    "previewSourceFingerprint VARCHAR(191) NULL",
  ]) {
    await ensureSqliteColumn(driver, "PostCache", column);
  }
  await driver.execute(`CREATE INDEX IF NOT EXISTS PostCache_creator_idx ON PostCache(site, service, creatorId, publishedAt)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS PostCache_expiresAt_idx ON PostCache(expiresAt)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS PostCache_previewSourceFingerprint_idx ON PostCache(site, previewSourceFingerprint)`);
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS PreviewAssetCache (
      site VARCHAR(32) NOT NULL,
      sourceVideoUrl TEXT NOT NULL,
      sourceFingerprint VARCHAR(191) NOT NULL,
      durationSeconds REAL NULL,
      thumbnailAssetPath TEXT NULL,
      clipAssetPath TEXT NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'pending',
      generatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      error TEXT NULL,
      PRIMARY KEY (site, sourceFingerprint)
    )
  `);
  for (const column of [
    "mediaKind VARCHAR(32) NULL",
    "mimeType VARCHAR(191) NULL",
    "width INT NULL",
    "height INT NULL",
    "nativeThumbnailUrl TEXT NULL",
    "probeStatus VARCHAR(64) NULL",
    "artifactStatus VARCHAR(64) NULL",
    "firstSeenAt DATETIME NULL",
    "hotUntil DATETIME NULL",
    "retryAfter DATETIME NULL",
    "generationAttempts INT NULL",
    "lastError TEXT NULL",
    "lastObservedContext VARCHAR(191) NULL",
  ]) {
    await ensureSqliteColumn(driver, "PreviewAssetCache", column);
  }
  await driver.execute(`CREATE INDEX IF NOT EXISTS PreviewAssetCache_lastSeenAt_idx ON PreviewAssetCache(lastSeenAt)`);
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS MediaSourceCache (
      site VARCHAR(32) NOT NULL,
      sourceVideoUrl TEXT NOT NULL,
      sourceFingerprint VARCHAR(191) NOT NULL,
      localVideoPath TEXT NULL,
      downloadStatus VARCHAR(64) NOT NULL DEFAULT 'pending',
      downloadedAt DATETIME NULL,
      lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      retentionUntil DATETIME NULL,
      fileSizeBytes BIGINT NULL,
      mimeType VARCHAR(191) NULL,
      downloadError TEXT NULL,
      downloadAttempts INT NULL,
      lastObservedContext VARCHAR(191) NULL,
      priorityClass VARCHAR(32) NULL,
      retryAfter DATETIME NULL,
      firstSeenAt DATETIME NULL,
      PRIMARY KEY (site, sourceFingerprint)
    )
  `);
  for (const column of [
    "localVideoPath TEXT NULL",
    "downloadStatus VARCHAR(64) NOT NULL DEFAULT 'pending'",
    "downloadedAt DATETIME NULL",
    "lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    "retentionUntil DATETIME NULL",
    "fileSizeBytes BIGINT NULL",
    "mimeType VARCHAR(191) NULL",
    "downloadError TEXT NULL",
    "downloadAttempts INT NULL",
    "lastObservedContext VARCHAR(191) NULL",
    "priorityClass VARCHAR(32) NULL",
    "retryAfter DATETIME NULL",
    "firstSeenAt DATETIME NULL",
  ]) {
    await ensureSqliteColumn(driver, "MediaSourceCache", column);
  }
  await driver.execute(`CREATE INDEX IF NOT EXISTS MediaSourceCache_lastSeenAt_idx ON MediaSourceCache(lastSeenAt)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS MediaSourceCache_retentionUntil_idx ON MediaSourceCache(retentionUntil)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS MediaSourceCache_priorityClass_idx ON MediaSourceCache(priorityClass)`);
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS CreatorSearchCache (
      site VARCHAR(32) NOT NULL,
      service VARCHAR(191) NOT NULL,
      creatorId VARCHAR(191) NOT NULL,
      normalizedQuery VARCHAR(255) NOT NULL DEFAULT '',
      media VARCHAR(32) NOT NULL DEFAULT 'all',
      page INT NOT NULL,
      perPage INT NOT NULL,
      payloadJson LONGTEXT NOT NULL,
      cachedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL,
      PRIMARY KEY (site, service, creatorId, normalizedQuery, media, page, perPage)
    )
  `);
  await driver.execute(`CREATE INDEX IF NOT EXISTS CreatorSearchCache_expiresAt_idx ON CreatorSearchCache(expiresAt)`);
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS PopularSnapshot (
      snapshotRunId VARCHAR(191) NOT NULL,
      rank INT NOT NULL,
      site VARCHAR(32) NOT NULL,
      period VARCHAR(32) NOT NULL,
      rangeKey VARCHAR(32) NOT NULL DEFAULT '',
      pageOffset INT NOT NULL DEFAULT 0,
      snapshotDate VARCHAR(32) NOT NULL,
      syncedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      postSite VARCHAR(32) NOT NULL,
      postService VARCHAR(191) NOT NULL,
      creatorId VARCHAR(191) NOT NULL,
      postId VARCHAR(191) NOT NULL,
      PRIMARY KEY (snapshotRunId, rank)
    )
  `);
  await driver.execute(`CREATE INDEX IF NOT EXISTS PopularSnapshot_lookup_idx ON PopularSnapshot(site, period, rangeKey, pageOffset, syncedAt)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS PopularSnapshot_snapshotDate_idx ON PopularSnapshot(snapshotDate)`);
}

function getPreviewAssetUpsertSql(driver: DatabaseDriver): string {
  if (driver.kind === "sqlite") {
    return `INSERT INTO PreviewAssetCache (site, sourceVideoUrl, sourceFingerprint, durationSeconds, thumbnailAssetPath, clipAssetPath, status, generatedAt, lastSeenAt, error, mediaKind, mimeType, width, height, nativeThumbnailUrl, probeStatus, artifactStatus, firstSeenAt, hotUntil, retryAfter, generationAttempts, lastError, lastObservedContext)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site, sourceFingerprint) DO UPDATE SET
        sourceVideoUrl = excluded.sourceVideoUrl,
        durationSeconds = excluded.durationSeconds,
        thumbnailAssetPath = excluded.thumbnailAssetPath,
        clipAssetPath = excluded.clipAssetPath,
        status = excluded.status,
        generatedAt = excluded.generatedAt,
        lastSeenAt = excluded.lastSeenAt,
        error = excluded.error,
        mediaKind = excluded.mediaKind,
        mimeType = excluded.mimeType,
        width = excluded.width,
        height = excluded.height,
        nativeThumbnailUrl = excluded.nativeThumbnailUrl,
        probeStatus = excluded.probeStatus,
        artifactStatus = excluded.artifactStatus,
        firstSeenAt = excluded.firstSeenAt,
        hotUntil = excluded.hotUntil,
        retryAfter = excluded.retryAfter,
        generationAttempts = excluded.generationAttempts,
        lastError = excluded.lastError,
        lastObservedContext = excluded.lastObservedContext`;
  }

  return `INSERT INTO PreviewAssetCache (site, sourceVideoUrl, sourceFingerprint, durationSeconds, thumbnailAssetPath, clipAssetPath, status, generatedAt, lastSeenAt, error, mediaKind, mimeType, width, height, nativeThumbnailUrl, probeStatus, artifactStatus, firstSeenAt, hotUntil, retryAfter, generationAttempts, lastError, lastObservedContext)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      sourceVideoUrl = VALUES(sourceVideoUrl),
      durationSeconds = VALUES(durationSeconds),
      thumbnailAssetPath = VALUES(thumbnailAssetPath),
      clipAssetPath = VALUES(clipAssetPath),
      status = VALUES(status),
      generatedAt = VALUES(generatedAt),
      lastSeenAt = VALUES(lastSeenAt),
      error = VALUES(error),
      mediaKind = VALUES(mediaKind),
      mimeType = VALUES(mimeType),
      width = VALUES(width),
      height = VALUES(height),
      nativeThumbnailUrl = VALUES(nativeThumbnailUrl),
      probeStatus = VALUES(probeStatus),
      artifactStatus = VALUES(artifactStatus),
      firstSeenAt = VALUES(firstSeenAt),
      hotUntil = VALUES(hotUntil),
      retryAfter = VALUES(retryAfter),
      generationAttempts = VALUES(generationAttempts),
      lastError = VALUES(lastError),
      lastObservedContext = VALUES(lastObservedContext)`;
}

function getMediaSourceCacheUpsertSql(driver: DatabaseDriver): string {
  if (driver.kind === "sqlite") {
    return `INSERT INTO MediaSourceCache (site, sourceVideoUrl, sourceFingerprint, localVideoPath, downloadStatus, downloadedAt, lastSeenAt, retentionUntil, fileSizeBytes, mimeType, downloadError, downloadAttempts, lastObservedContext, priorityClass, retryAfter, firstSeenAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site, sourceFingerprint) DO UPDATE SET
        sourceVideoUrl = excluded.sourceVideoUrl,
        localVideoPath = excluded.localVideoPath,
        downloadStatus = excluded.downloadStatus,
        downloadedAt = excluded.downloadedAt,
        lastSeenAt = excluded.lastSeenAt,
        retentionUntil = excluded.retentionUntil,
        fileSizeBytes = excluded.fileSizeBytes,
        mimeType = excluded.mimeType,
        downloadError = excluded.downloadError,
        downloadAttempts = excluded.downloadAttempts,
        lastObservedContext = excluded.lastObservedContext,
        priorityClass = excluded.priorityClass,
        retryAfter = excluded.retryAfter,
        firstSeenAt = excluded.firstSeenAt`;
  }

  return `INSERT INTO MediaSourceCache (site, sourceVideoUrl, sourceFingerprint, localVideoPath, downloadStatus, downloadedAt, lastSeenAt, retentionUntil, fileSizeBytes, mimeType, downloadError, downloadAttempts, lastObservedContext, priorityClass, retryAfter, firstSeenAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      sourceVideoUrl = VALUES(sourceVideoUrl),
      localVideoPath = VALUES(localVideoPath),
      downloadStatus = VALUES(downloadStatus),
      downloadedAt = VALUES(downloadedAt),
      lastSeenAt = VALUES(lastSeenAt),
      retentionUntil = VALUES(retentionUntil),
      fileSizeBytes = VALUES(fileSizeBytes),
      mimeType = VALUES(mimeType),
      downloadError = VALUES(downloadError),
      downloadAttempts = VALUES(downloadAttempts),
      lastObservedContext = VALUES(lastObservedContext),
      priorityClass = VALUES(priorityClass),
      retryAfter = VALUES(retryAfter),
      firstSeenAt = VALUES(firstSeenAt)`;
}

function getCreatorSearchCacheUpsertSql(driver: DatabaseDriver): string {
  if (driver.kind === "sqlite") {
    return `INSERT INTO CreatorSearchCache (site, service, creatorId, normalizedQuery, media, page, perPage, payloadJson, cachedAt, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site, service, creatorId, normalizedQuery, media, page, perPage) DO UPDATE SET
        payloadJson = excluded.payloadJson,
        cachedAt = excluded.cachedAt,
        expiresAt = excluded.expiresAt`;
  }

  return `INSERT INTO CreatorSearchCache (site, service, creatorId, normalizedQuery, media, page, perPage, payloadJson, cachedAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      payloadJson = VALUES(payloadJson),
      cachedAt = VALUES(cachedAt),
      expiresAt = VALUES(expiresAt)`;
}
function getUpsertSql(driver: DatabaseDriver, table: "CreatorIndex" | "PostCache"): string {
  if (driver.kind === "sqlite") {
    if (table === "CreatorIndex") {
      return `INSERT INTO CreatorIndex (site, service, creatorId, name, normalizedName, favorited, updatedAt, indexedAt, profileImageUrl, bannerImageUrl, publicId, postCount, rawPreviewPayload, syncedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(site, service, creatorId) DO UPDATE SET
          name = excluded.name,
          normalizedName = excluded.normalizedName,
          favorited = excluded.favorited,
          updatedAt = excluded.updatedAt,
          indexedAt = excluded.indexedAt,
          profileImageUrl = excluded.profileImageUrl,
          bannerImageUrl = excluded.bannerImageUrl,
          publicId = excluded.publicId,
          postCount = excluded.postCount,
          rawPreviewPayload = excluded.rawPreviewPayload,
          syncedAt = excluded.syncedAt`;
    }

    return `INSERT INTO PostCache (site, service, creatorId, postId, title, excerpt, publishedAt, addedAt, editedAt, previewImageUrl, videoUrl, thumbUrl, mediaType, authorName, rawPreviewPayload, rawDetailPayload, detailLevel, sourceKind, longestVideoUrl, longestVideoDurationSeconds, previewThumbnailAssetPath, previewClipAssetPath, previewStatus, previewGeneratedAt, previewError, previewSourceFingerprint, cachedAt, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site, service, creatorId, postId) DO UPDATE SET
        title = excluded.title,
        excerpt = excluded.excerpt,
        publishedAt = excluded.publishedAt,
        addedAt = excluded.addedAt,
        editedAt = excluded.editedAt,
        previewImageUrl = excluded.previewImageUrl,
        videoUrl = excluded.videoUrl,
        thumbUrl = excluded.thumbUrl,
        mediaType = excluded.mediaType,
        authorName = excluded.authorName,
        rawPreviewPayload = excluded.rawPreviewPayload,
        rawDetailPayload = excluded.rawDetailPayload,
        detailLevel = excluded.detailLevel,
        sourceKind = excluded.sourceKind,
        longestVideoUrl = excluded.longestVideoUrl,
        longestVideoDurationSeconds = excluded.longestVideoDurationSeconds,
        previewThumbnailAssetPath = excluded.previewThumbnailAssetPath,
        previewClipAssetPath = excluded.previewClipAssetPath,
        previewStatus = excluded.previewStatus,
        previewGeneratedAt = excluded.previewGeneratedAt,
        previewError = excluded.previewError,
        previewSourceFingerprint = excluded.previewSourceFingerprint,
        cachedAt = excluded.cachedAt,
        expiresAt = excluded.expiresAt`;
  }

  if (table === "CreatorIndex") {
    return `INSERT INTO CreatorIndex (site, service, creatorId, name, normalizedName, favorited, updatedAt, indexedAt, profileImageUrl, bannerImageUrl, publicId, postCount, rawPreviewPayload, syncedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        normalizedName = VALUES(normalizedName),
        favorited = VALUES(favorited),
        updatedAt = VALUES(updatedAt),
        indexedAt = VALUES(indexedAt),
        profileImageUrl = VALUES(profileImageUrl),
        bannerImageUrl = VALUES(bannerImageUrl),
        publicId = VALUES(publicId),
        postCount = VALUES(postCount),
        rawPreviewPayload = VALUES(rawPreviewPayload),
        syncedAt = VALUES(syncedAt)`;
  }

  return `INSERT INTO PostCache (site, service, creatorId, postId, title, excerpt, publishedAt, addedAt, editedAt, previewImageUrl, videoUrl, thumbUrl, mediaType, authorName, rawPreviewPayload, rawDetailPayload, detailLevel, sourceKind, longestVideoUrl, longestVideoDurationSeconds, previewThumbnailAssetPath, previewClipAssetPath, previewStatus, previewGeneratedAt, previewError, previewSourceFingerprint, cachedAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      excerpt = VALUES(excerpt),
      publishedAt = VALUES(publishedAt),
      addedAt = VALUES(addedAt),
      editedAt = VALUES(editedAt),
      previewImageUrl = VALUES(previewImageUrl),
      videoUrl = VALUES(videoUrl),
      thumbUrl = VALUES(thumbUrl),
      mediaType = VALUES(mediaType),
      authorName = VALUES(authorName),
      rawPreviewPayload = VALUES(rawPreviewPayload),
      rawDetailPayload = VALUES(rawDetailPayload),
      detailLevel = VALUES(detailLevel),
      sourceKind = VALUES(sourceKind),
      longestVideoUrl = VALUES(longestVideoUrl),
      longestVideoDurationSeconds = VALUES(longestVideoDurationSeconds),
      previewThumbnailAssetPath = VALUES(previewThumbnailAssetPath),
      previewClipAssetPath = VALUES(previewClipAssetPath),
      previewStatus = VALUES(previewStatus),
      previewGeneratedAt = VALUES(previewGeneratedAt),
      previewError = VALUES(previewError),
      previewSourceFingerprint = VALUES(previewSourceFingerprint),
      cachedAt = VALUES(cachedAt),
      expiresAt = VALUES(expiresAt)`;
}

function createRepository(driver: DatabaseDriver): PerformanceRepository {
  return {
    async replaceCreatorSnapshot({ site, syncedAt, creators }) {
      await driver.transaction(async (tx) => {
        await tx.execute("DELETE FROM CreatorIndex WHERE site = ?", [site]);
        const rows = creators.map((creator) => [
          site,
          creator.service,
          creator.creatorId,
          creator.name,
          normalizeCreatorName(creator.name),
          creator.favorited === null || creator.favorited === undefined ? 0 : Number(creator.favorited),
          toDate(creator.updated),
          toDate(creator.indexed),
          creator.profileImageUrl ?? null,
          creator.bannerImageUrl ?? null,
          creator.publicId ?? null,
          creator.postCount ?? null,
          serializeJson(creator.rawPreviewPayload),
          syncedAt,
        ]);
        for (const chunk of chunkArray(rows, 250)) {
          await tx.execute(
            `INSERT INTO CreatorIndex (site, service, creatorId, name, normalizedName, favorited, updatedAt, indexedAt, profileImageUrl, bannerImageUrl, publicId, postCount, rawPreviewPayload, syncedAt) VALUES ${bulkValuesSql(14, chunk.length)}`,
            flattenRows(chunk)
          );
        }
      });
    },

    async upsertCreatorProfile(input) {
      let favorited = input.favorited;
      if (favorited === null || favorited === undefined) {
        const existingRows = await driver.query<any>(
          "SELECT favorited FROM CreatorIndex WHERE site = ? AND service = ? AND creatorId = ? LIMIT 1",
          [input.site, input.service, input.creatorId]
        );
        favorited = existingRows[0]?.favorited ?? 0;
      }

      await driver.execute(getUpsertSql(driver, "CreatorIndex"), [
        input.site,
        input.service,
        input.creatorId,
        input.name,
        normalizeCreatorName(input.name),
        favorited === null || favorited === undefined ? 0 : Number(favorited),
        toDate(input.updated),
        toDate(input.indexed),
        input.profileImageUrl ?? null,
        input.bannerImageUrl ?? null,
        input.publicId ?? null,
        input.postCount ?? null,
        serializeJson(input.rawPreviewPayload),
        input.syncedAt ?? new Date(),
      ]);
    },

    async getCreatorProfile({ site, service, creatorId }) {
      const rows = await driver.query<any>("SELECT * FROM CreatorIndex WHERE site = ? AND service = ? AND creatorId = ? LIMIT 1", [site, service, creatorId]);
      return rows[0] ? mapCreatorRow(rows[0]) : null;
    },

    async searchCreatorsPage(input) {
      const base = getSearchWhere(input);
      if (input.filter === "liked" && base.likedEntries.length === 0) {
        return { items: [], total: 0, page: input.page, perPage: input.perPage, services: [], snapshotFresh: true, syncedAt: null };
      }

      const offset = Math.max(0, (input.page - 1) * input.perPage);
      const rows = await driver.query<any>(
        `SELECT * FROM CreatorIndex ${base.whereSql} ORDER BY ${getSearchOrderSql(input.sort)} LIMIT ? OFFSET ?`,
        [...base.values, input.perPage, offset]
      );
      const totalRows = await driver.query<any>(`SELECT COUNT(*) AS total FROM CreatorIndex ${base.whereSql}`, base.values);

      const serviceClauses: string[] = [];
      const serviceValues: any[] = [];
      if (base.relevantSites.length === 1) {
        serviceClauses.push("site = ?");
        serviceValues.push(base.relevantSites[0]);
      } else if (base.relevantSites.length > 1) {
        serviceClauses.push(`site IN (${base.relevantSites.map(() => "?").join(", ")})`);
        serviceValues.push(...base.relevantSites);
      }
      if (input.filter === "liked" && base.likedEntries.length > 0) {
        serviceClauses.push(`(${base.likedEntries.map(() => "(site = ? AND service = ? AND creatorId = ?)").join(" OR ")})`);
        for (const entry of base.likedEntries) {
          serviceValues.push(entry.site, entry.service, entry.creatorId);
        }
      }
      const services = serviceClauses.length
        ? await driver.query<any>(`SELECT DISTINCT service FROM CreatorIndex WHERE ${serviceClauses.join(" AND ")} ORDER BY service ASC`, serviceValues)
        : await driver.query<any>("SELECT DISTINCT service FROM CreatorIndex ORDER BY service ASC");

      let snapshotFresh = false;
      let syncedAt: Date | null = null;
      if (base.relevantSites.length > 0) {
        const grouped = await driver.query<any>(
          `SELECT site, MAX(syncedAt) AS syncedAt, COUNT(*) AS total FROM CreatorIndex WHERE site IN (${base.relevantSites.map(() => "?").join(", ")}) GROUP BY site`,
          base.relevantSites
        );
        const groupedBySite = new Map(grouped.map((row) => [row.site, row]));
        snapshotFresh = base.relevantSites.every((site) => {
          const row = groupedBySite.get(site);
          return Number(row?.total ?? 0) > 0 && isSnapshotFresh(row?.syncedAt, CREATOR_SNAPSHOT_TTL_MS);
        });
        const syncedRows = base.relevantSites
          .map((site) => toDate(groupedBySite.get(site)?.syncedAt))
          .filter((value): value is Date => Boolean(value));
        syncedAt = syncedRows.length ? syncedRows.reduce((earliest, current) => (earliest <= current ? earliest : current)) : null;
      }

      return {
        items: rows.map(mapCreatorRow),
        total: Number(totalRows[0]?.total ?? 0),
        page: input.page,
        perPage: input.perPage,
        services: services.map((row) => String(row.service)),
        snapshotFresh,
        syncedAt,
      };
    },

    async upsertPostCache(input) {
      await driver.execute(getUpsertSql(driver, "PostCache"), [
        input.site,
        input.service,
        input.creatorId,
        input.postId,
        input.title ?? null,
        input.excerpt ?? null,
        toDate(input.publishedAt),
        toDate(input.addedAt),
        toDate(input.editedAt),
        input.previewImageUrl ?? null,
        input.videoUrl ?? null,
        input.thumbUrl ?? null,
        input.mediaType ?? null,
        input.authorName ?? null,
        serializeJson(input.rawPreviewPayload),
        serializeJson(input.rawDetailPayload),
        input.detailLevel,
        input.sourceKind,
        input.longestVideoUrl ?? null,
        input.longestVideoDurationSeconds ?? null,
        input.previewThumbnailAssetPath ?? null,
        input.previewClipAssetPath ?? null,
        input.previewStatus ?? null,
        toDate(input.previewGeneratedAt),
        input.previewError ?? null,
        input.previewSourceFingerprint ?? null,
        input.cachedAt,
        input.expiresAt,
      ]);
    },

    async getPostCache({ site, service, creatorId, postId }) {
      const rows = await driver.query<any>("SELECT * FROM PostCache WHERE site = ? AND service = ? AND creatorId = ? AND postId = ? LIMIT 1", [site, service, creatorId, postId]);
      return rows[0] ? mapPostRow(rows[0]) : null;
    },

    async listCreatorPosts({ site, service, creatorId, offset, limit, freshOnly, now = new Date() }) {
      const rows = await driver.query<any>(
        `SELECT * FROM PostCache WHERE site = ? AND service = ? AND creatorId = ? ${freshOnly ? "AND expiresAt >= ?" : ""} ORDER BY publishedAt DESC, addedAt DESC, editedAt DESC, cachedAt DESC LIMIT ? OFFSET ?`,
        freshOnly ? [site, service, creatorId, now, limit, offset] : [site, service, creatorId, limit, offset]
      );
      return rows.map(mapPostRow);
    },

    async replacePopularSnapshot(input) {
      const snapshotRunId = crypto.randomUUID();
      const rangeKey = input.rangeDate ?? "";
      const syncedAt = new Date();
      await driver.transaction(async (tx) => {
        await tx.execute("DELETE FROM PopularSnapshot WHERE site = ? AND period = ? AND rangeKey = ? AND pageOffset = ? AND snapshotDate = ?", [input.site, input.period, rangeKey, input.pageOffset, input.snapshotDate]);
        const rows = input.posts.map((post) => [snapshotRunId, post.rank, input.site, input.period, rangeKey, input.pageOffset, input.snapshotDate, syncedAt, post.site, post.service, post.creatorId, post.postId]);
        for (const chunk of chunkArray(rows, 250)) {
          await tx.execute(
            `INSERT INTO PopularSnapshot (snapshotRunId, rank, site, period, rangeKey, pageOffset, snapshotDate, syncedAt, postSite, postService, creatorId, postId) VALUES ${bulkValuesSql(12, chunk.length)}`,
            flattenRows(chunk)
          );
        }
      });
    },

    async getPopularSnapshot({ site, period, rangeDate, pageOffset, now = new Date() }) {
      const rangeKey = rangeDate ?? "";
      const latestRows = await driver.query<any>("SELECT snapshotRunId, snapshotDate, syncedAt FROM PopularSnapshot WHERE site = ? AND period = ? AND rangeKey = ? AND pageOffset = ? ORDER BY syncedAt DESC LIMIT 1", [site, period, rangeKey, pageOffset]);
      const latest = latestRows[0];
      if (!latest) {
        return { posts: [], snapshotFresh: false, snapshotDate: null, syncedAt: null };
      }

      const rows = await driver.query<any>(
        `SELECT pc.* FROM PopularSnapshot ps INNER JOIN PostCache pc ON pc.site = ps.postSite AND pc.service = ps.postService AND pc.creatorId = ps.creatorId AND pc.postId = ps.postId WHERE ps.snapshotRunId = ? ORDER BY ps.rank ASC`,
        [latest.snapshotRunId]
      );
      return {
        posts: rows.map(mapPostRow),
        snapshotFresh: isSnapshotFresh(latest.syncedAt, POPULAR_SNAPSHOT_TTL_MS, now),
        snapshotDate: String(latest.snapshotDate),
        syncedAt: toDate(latest.syncedAt),
      };
    },

    async getPreviewAssetCache({ site, sourceFingerprint }) {
      const rows = await driver.query<any>("SELECT * FROM PreviewAssetCache WHERE site = ? AND sourceFingerprint = ? LIMIT 1", [site, sourceFingerprint]);
      return rows[0] ? mapPreviewAssetRow(rows[0]) : null;
    },

    async upsertPreviewAssetCache(input) {
      await driver.execute(getPreviewAssetUpsertSql(driver), [
        input.site,
        input.sourceVideoUrl,
        input.sourceFingerprint,
        input.durationSeconds ?? null,
        input.thumbnailAssetPath ?? null,
        input.clipAssetPath ?? null,
        input.status,
        input.generatedAt,
        input.lastSeenAt,
        input.error ?? null,
        input.mediaKind ?? null,
        input.mimeType ?? null,
        input.width ?? null,
        input.height ?? null,
        input.nativeThumbnailUrl ?? null,
        input.probeStatus ?? null,
        input.artifactStatus ?? null,
        input.firstSeenAt ?? null,
        input.hotUntil ?? null,
        input.retryAfter ?? null,
        input.generationAttempts ?? null,
        input.lastError ?? null,
        input.lastObservedContext ?? null,
      ]);
    },

    async touchPreviewAssetCache({ site, sourceFingerprint, lastSeenAt }) {
      await driver.execute("UPDATE PreviewAssetCache SET lastSeenAt = ? WHERE site = ? AND sourceFingerprint = ?", [lastSeenAt, site, sourceFingerprint]);
    },

    async listPreviewAssetCachesOlderThan({ cutoff }) {
      const rows = await driver.query<any>("SELECT * FROM PreviewAssetCache WHERE lastSeenAt < ? ORDER BY lastSeenAt ASC", [cutoff]);
      return rows.map(mapPreviewAssetRow);
    },

    async deletePreviewAssetCaches({ entries }) {
      if (entries.length === 0) {
        return;
      }

      for (const chunk of chunkArray(entries, 250)) {
        const predicates = chunk.map(() => "(site = ? AND sourceFingerprint = ?)").join(" OR ");
        await driver.execute(
          `DELETE FROM PreviewAssetCache WHERE ${predicates}`,
          chunk.flatMap((entry) => [entry.site, entry.sourceFingerprint])
        );
      }
    },

    async getPreviewAssetStats() {
      const rows = await driver.query<any>(
        `SELECT
           COUNT(*) AS totalEntries,
           SUM(CASE WHEN status IN ('ready', 'thumbnail-ready') THEN 1 ELSE 0 END) AS readyEntries,
           SUM(CASE WHEN status IN ('pending', 'metadata-only') THEN 1 ELSE 0 END) AS partialEntries,
           SUM(CASE WHEN status NOT IN ('ready', 'thumbnail-ready', 'pending', 'metadata-only') THEN 1 ELSE 0 END) AS failedEntries
         FROM PreviewAssetCache`
      );
      const row = rows[0] ?? {};
      return {
        totalEntries: Number(row.totalEntries ?? 0),
        readyEntries: Number(row.readyEntries ?? 0),
        partialEntries: Number(row.partialEntries ?? 0),
        failedEntries: Number(row.failedEntries ?? 0),
      };
    },

    async getMediaSourceCache({ site, sourceFingerprint }) {
      const rows = await driver.query<any>("SELECT * FROM MediaSourceCache WHERE site = ? AND sourceFingerprint = ? LIMIT 1", [site, sourceFingerprint]);
      return rows[0] ? mapMediaSourceRow(rows[0]) : null;
    },

    async upsertMediaSourceCache(input) {
      await driver.execute(getMediaSourceCacheUpsertSql(driver), [
        input.site,
        input.sourceVideoUrl,
        input.sourceFingerprint,
        input.localVideoPath ?? null,
        input.downloadStatus,
        input.downloadedAt ?? null,
        input.lastSeenAt,
        input.retentionUntil ?? null,
        input.fileSizeBytes ?? null,
        input.mimeType ?? null,
        input.downloadError ?? null,
        input.downloadAttempts ?? null,
        input.lastObservedContext ?? null,
        input.priorityClass ?? null,
        input.retryAfter ?? null,
        input.firstSeenAt ?? null,
      ]);
    },

    async touchMediaSourceCache({ site, sourceFingerprint, lastSeenAt, retentionUntil, priorityClass }) {
      await driver.execute(
        "UPDATE MediaSourceCache SET lastSeenAt = ?, retentionUntil = COALESCE(?, retentionUntil), priorityClass = COALESCE(?, priorityClass) WHERE site = ? AND sourceFingerprint = ?",
        [lastSeenAt, retentionUntil ?? null, priorityClass ?? null, site, sourceFingerprint]
      );
    },

    async listExpiredMediaSourceCaches({ cutoff }) {
      const rows = await driver.query<any>(
        "SELECT * FROM MediaSourceCache WHERE COALESCE(retentionUntil, lastSeenAt) < ? ORDER BY COALESCE(retentionUntil, lastSeenAt) ASC",
        [cutoff]
      );
      return rows.map(mapMediaSourceRow);
    },

    async deleteMediaSourceCaches({ entries }) {
      if (entries.length === 0) {
        return;
      }

      for (const chunk of chunkArray(entries, 250)) {
        const predicates = chunk.map(() => "(site = ? AND sourceFingerprint = ?)").join(" OR ");
        await driver.execute(
          `DELETE FROM MediaSourceCache WHERE ${predicates}`,
          chunk.flatMap((entry) => [entry.site, entry.sourceFingerprint])
        );
      }
    },

    async getMediaSourceCacheStats() {
      const rows = await driver.query<any>(
        `SELECT
           COUNT(*) AS totalEntries,
           COALESCE(SUM(COALESCE(fileSizeBytes, 0)), 0) AS totalSizeBytes,
           SUM(CASE WHEN downloadStatus = 'source-ready' THEN 1 ELSE 0 END) AS readyEntries,
           SUM(CASE WHEN downloadStatus IN ('remote-http-error', 'remote-rate-limited', 'source-not-found') THEN 1 ELSE 0 END) AS remoteHttpErrors,
           SUM(CASE WHEN downloadStatus = 'tool-missing' THEN 1 ELSE 0 END) AS toolMissing
         FROM MediaSourceCache`
      );
      const row = rows[0] ?? {};
      return {
        totalEntries: Number(row.totalEntries ?? 0),
        totalSizeBytes: Number(row.totalSizeBytes ?? 0),
        readyEntries: Number(row.readyEntries ?? 0),
        remoteHttpErrors: Number(row.remoteHttpErrors ?? 0),
        toolMissing: Number(row.toolMissing ?? 0),
      };
    },

    async getCreatorSearchCache({ site, service, creatorId, normalizedQuery, media, page, perPage }) {
      const rows = await driver.query<any>(
        "SELECT * FROM CreatorSearchCache WHERE site = ? AND service = ? AND creatorId = ? AND normalizedQuery = ? AND media = ? AND page = ? AND perPage = ? LIMIT 1",
        [site, service, creatorId, normalizedQuery, media, page, perPage]
      );
      return rows[0] ? mapCreatorSearchCacheRow(rows[0]) : null;
    },

    async upsertCreatorSearchCache(input) {
      await driver.execute(getCreatorSearchCacheUpsertSql(driver), [
        input.site,
        input.service,
        input.creatorId,
        input.normalizedQuery,
        input.media,
        input.page,
        input.perPage,
        serializeJson(input.payload),
        input.cachedAt,
        input.expiresAt,
      ]);
    },

    async listActivePreviewSourceFingerprints({ snapshotDateFrom }) {
      const rows = await driver.query<any>(
        `SELECT DISTINCT pc.site AS site, pc.previewSourceFingerprint AS sourceFingerprint
         FROM PopularSnapshot ps
         INNER JOIN PostCache pc
           ON pc.site = ps.postSite
          AND pc.service = ps.postService
          AND pc.creatorId = ps.creatorId
          AND pc.postId = ps.postId
         WHERE ps.snapshotDate >= ?
           AND pc.previewSourceFingerprint IS NOT NULL
         ORDER BY pc.site ASC, pc.previewSourceFingerprint ASC`,
        [snapshotDateFrom]
      );

      return rows.map((row) => ({
        site: row.site as Site,
        sourceFingerprint: String(row.sourceFingerprint),
      }));
    },

    async deletePopularSnapshotsOlderThan({ snapshotDateBefore }) {
      await driver.execute("DELETE FROM PopularSnapshot WHERE snapshotDate < ?", [snapshotDateBefore]);
    },

    async disconnect() {
      await driver.disconnect();
    },
  };
}

export async function createLocalPerformanceRepository(options?: { databaseUrl?: string }): Promise<PerformanceRepository> {
  const { getLocalPrismaClient } = await import("../prisma.ts");
  const prisma = getLocalPrismaClient(options?.databaseUrl) as unknown as LocalPrismaQueryClient;
  const driver = createSqliteDriver(prisma);
  await ensurePerformanceTables(driver);
  return createRepository(driver);
}

export async function getPerformanceRepository(): Promise<PerformanceRepository> {
  if (isLocalDevMode()) {
    if (!globalPerfRepository.__kimonoPerfRepository) {
      globalPerfRepository.__kimonoPerfRepository = await createLocalPerformanceRepository();
    }
    return globalPerfRepository.__kimonoPerfRepository;
  }

  const driver = createMysqlDriver();
  await ensurePerformanceTables(driver);
  return createRepository(driver);
}




