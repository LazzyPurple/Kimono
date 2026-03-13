import type { PrismaClient } from "@prisma/client";
import type mysql from "mysql2/promise";

import { isLocalDevMode } from "./local-dev-mode.ts";
import {
  CREATOR_SNAPSHOT_TTL_MS,
  POPULAR_SNAPSHOT_TTL_MS,
  getRelevantSearchSites,
  isSnapshotFresh,
  normalizeCreatorName,
  parseLikedCreatorKey,
  type PopularPeriod,
  type SearchCreatorsPageParams,
} from "./perf-cache.ts";

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
  favorited: number;
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
  disconnect(): Promise<void>;
}

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
  return {
    id: String(row.creatorId ?? row.id),
    site: row.site as Site,
    service: String(row.service),
    name: String(row.name),
    favorited: Number(row.favorited ?? 0),
    updated: toDate(row.updatedAt)?.toISOString() ?? null,
    indexed: toDate(row.indexedAt)?.toISOString() ?? null,
    profileImageUrl: row.profileImageUrl ?? null,
    bannerImageUrl: row.bannerImageUrl ?? null,
    publicId: row.publicId ?? null,
    postCount: row.postCount === null || row.postCount === undefined ? null : Number(row.postCount),
    rawPreviewPayload: parseJson(row.rawPreviewPayload),
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

function createSqliteDriver(prisma: PrismaClient): DatabaseDriver {
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
      const db = await import("./db.ts");
      return db.query(sql, values);
    },
    async execute(sql, values = []) {
      const db = await import("./db.ts");
      await db.execute(sql, values);
    },
    async transaction(fn) {
      const { pool } = await import("./db.ts");
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
        cachedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        expiresAt DATETIME(3) NOT NULL,
        PRIMARY KEY (site, service, creatorId, postId),
        KEY PostCache_creator_idx (site, service, creatorId, publishedAt),
        KEY PostCache_expiresAt_idx (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
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
        KEY PopularSnapshot_lookup_idx (site, period, rangeKey, pageOffset, syncedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
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
      cachedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL,
      PRIMARY KEY (site, service, creatorId, postId)
    )
  `);
  await driver.execute(`CREATE INDEX IF NOT EXISTS PostCache_creator_idx ON PostCache(site, service, creatorId, publishedAt)`);
  await driver.execute(`CREATE INDEX IF NOT EXISTS PostCache_expiresAt_idx ON PostCache(expiresAt)`);
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

    return `INSERT INTO PostCache (site, service, creatorId, postId, title, excerpt, publishedAt, addedAt, editedAt, previewImageUrl, videoUrl, thumbUrl, mediaType, authorName, rawPreviewPayload, rawDetailPayload, detailLevel, sourceKind, cachedAt, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  return `INSERT INTO PostCache (site, service, creatorId, postId, title, excerpt, publishedAt, addedAt, editedAt, previewImageUrl, videoUrl, thumbUrl, mediaType, authorName, rawPreviewPayload, rawDetailPayload, detailLevel, sourceKind, cachedAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          Number(creator.favorited ?? 0),
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
      await driver.execute(getUpsertSql(driver, "CreatorIndex"), [
        input.site,
        input.service,
        input.creatorId,
        input.name,
        normalizeCreatorName(input.name),
        Number(input.favorited ?? 0),
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

    async disconnect() {
      await driver.disconnect();
    },
  };
}

export async function createLocalPerformanceRepository(options?: { databaseUrl?: string }): Promise<PerformanceRepository> {
  const { getLocalPrismaClient } = await import("./prisma.ts");
  const prisma = getLocalPrismaClient(options?.databaseUrl);
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
