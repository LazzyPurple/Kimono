import { isLocalDevMode } from "../local-dev-mode.ts";

export type SupportedSite = "kemono" | "coomer";
export type StoredFavoriteChronologyKind = "creator" | "post";
export type StoredFavoriteSnapshotKind = "creator" | "post";
export type StoredCreatorSnapshotKind = "profile" | "posts";

export interface StoredUser {
  id: string;
  email: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  createdAt: Date;
}

export interface StoredKimonoSession {
  id: string;
  site: SupportedSite;
  cookie: string;
  username: string;
  savedAt: Date;
}

export interface StoredCacheRecord {
  id?: string;
  site?: string;
  kind?: string;
  data: string;
  updatedAt: Date;
}

export interface StoredDiscoveryBlock {
  id: string;
  site: SupportedSite;
  service: string;
  creatorId: string;
  blockedAt: Date;
}

export interface StoredFavoriteChronology {
  kind: StoredFavoriteChronologyKind;
  site: SupportedSite;
  service: string;
  creatorId: string;
  postId: string | null;
  favoritedAt: Date;
}

export interface DataStore {
  getOrCreateAdminUser(): Promise<StoredUser>;
  getUserById(id: string): Promise<StoredUser | null>;
  updateUserTotpSecret(id: string, secret: string): Promise<void>;
  enableUserTotp(id: string): Promise<void>;
  getLatestKimonoSession(site: SupportedSite): Promise<StoredKimonoSession | null>;
  getKimonoSessions(): Promise<StoredKimonoSession[]>;
  saveKimonoSession(input: {
    site: SupportedSite;
    cookie: string;
    username: string;
  }): Promise<void>;
  deleteKimonoSession(site: SupportedSite): Promise<void>;
  getCreatorsCache(site: string): Promise<StoredCacheRecord | null>;
  setCreatorsCache(site: string, data: unknown[], updatedAt?: Date): Promise<void>;
  getDiscoveryBlocks(): Promise<StoredDiscoveryBlock[]>;
  blockDiscoveryCreator(input: {
    site: SupportedSite;
    service: string;
    creatorId: string;
  }): Promise<void>;
  unblockDiscoveryCreator(input: {
    site: SupportedSite;
    service: string;
    creatorId: string;
  }): Promise<void>;
  getDiscoveryCache(id?: string): Promise<StoredCacheRecord | null>;
  setDiscoveryCache(id: string, data: unknown[], updatedAt?: Date): Promise<void>;
  getFavoriteSnapshot(input: {
    kind: StoredFavoriteSnapshotKind;
    site: SupportedSite;
  }): Promise<StoredCacheRecord | null>;
  setFavoriteSnapshot(input: {
    kind: StoredFavoriteSnapshotKind;
    site: SupportedSite;
    data: unknown[];
    updatedAt?: Date;
  }): Promise<void>;
  getCreatorSnapshot(input: {
    kind: StoredCreatorSnapshotKind;
    site: SupportedSite;
    service: string;
    creatorId: string;
    offset?: number;
    query?: string | null;
  }): Promise<StoredCacheRecord | null>;
  setCreatorSnapshot(input: {
    kind: StoredCreatorSnapshotKind;
    site: SupportedSite;
    service: string;
    creatorId: string;
    data: unknown;
    offset?: number;
    query?: string | null;
    updatedAt?: Date;
  }): Promise<void>;
  listFavoriteChronology(input?: {
    kind?: StoredFavoriteChronologyKind;
    site?: SupportedSite;
  }): Promise<StoredFavoriteChronology[]>;
  upsertFavoriteChronology(input: {
    kind: StoredFavoriteChronologyKind;
    site: SupportedSite;
    service: string;
    creatorId: string;
    postId?: string | null;
    favoritedAt?: Date;
  }): Promise<void>;
  deleteFavoriteChronology(input: {
    kind: StoredFavoriteChronologyKind;
    site: SupportedSite;
    service: string;
    creatorId: string;
    postId?: string | null;
  }): Promise<void>;
  disconnect(): Promise<void>;
}

type ProductionDbModule = typeof import("../db.ts");
type LocalPrismaDataStoreClient = {
  user: {
    findFirst(input: unknown): Promise<any>;
    findUnique(input: unknown): Promise<any>;
    create(input: unknown): Promise<any>;
    update(input: unknown): Promise<any>;
  };
  kimonoSession: {
    findFirst(input: unknown): Promise<any>;
    findMany(input: unknown): Promise<any>;
    create(input: unknown): Promise<any>;
    deleteMany(input: unknown): Promise<{ count: number }>;
  };
  creatorsCache: {
    findUnique(input: unknown): Promise<any>;
    upsert(input: unknown): Promise<any>;
  };
  discoveryBlock: {
    findMany(input: unknown): Promise<any[]>;
    create(input: unknown): Promise<any>;
    deleteMany(input: unknown): Promise<{ count: number }>;
  };
  discoveryCache: {
    findUnique(input: unknown): Promise<any>;
    upsert(input: unknown): Promise<any>;
  };
  $queryRawUnsafe<T = any>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
  $disconnect(): Promise<void>;
};

const FAVORITE_CHRONOLOGY_TABLE_SQLITE = `
  CREATE TABLE IF NOT EXISTS FavoriteChronology (
    kind TEXT NOT NULL,
    site TEXT NOT NULL,
    service TEXT NOT NULL,
    creatorId TEXT NOT NULL,
    postId TEXT NOT NULL DEFAULT '',
    favoritedAt TEXT NOT NULL,
    PRIMARY KEY (kind, site, service, creatorId, postId)
  );
`;

const FAVORITE_CHRONOLOGY_TABLE_MYSQL = `
  CREATE TABLE IF NOT EXISTS \`FavoriteChronology\` (
    kind VARCHAR(32) NOT NULL,
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    postId VARCHAR(191) NOT NULL DEFAULT '',
    favoritedAt DATETIME(3) NOT NULL,
    PRIMARY KEY (kind, site, service, creatorId, postId),
    KEY \`FavoriteChronology_kind_favoritedAt_idx\` (kind, favoritedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const FAVORITE_CHRONOLOGY_INDEX_SQLITE = `
  CREATE INDEX IF NOT EXISTS FavoriteChronology_kind_favoritedAt_idx
  ON FavoriteChronology (kind, favoritedAt DESC);
`;

const FAVORITE_SNAPSHOT_TABLE_SQLITE = `
  CREATE TABLE IF NOT EXISTS FavoriteSnapshot (
    kind TEXT NOT NULL,
    site TEXT NOT NULL,
    data TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (kind, site)
  );
`;

const FAVORITE_SNAPSHOT_TABLE_MYSQL = `
  CREATE TABLE IF NOT EXISTS \`FavoriteSnapshot\` (
    kind VARCHAR(32) NOT NULL,
    site VARCHAR(32) NOT NULL,
    data LONGTEXT NOT NULL,
    updatedAt DATETIME(3) NOT NULL,
    PRIMARY KEY (kind, site)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATOR_SNAPSHOT_TABLE_SQLITE = `
  CREATE TABLE IF NOT EXISTS CreatorSnapshot (
    kind TEXT NOT NULL,
    site TEXT NOT NULL,
    service TEXT NOT NULL,
    creatorId TEXT NOT NULL,
    pageOffset INTEGER NOT NULL DEFAULT 0,
    queryKey TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (kind, site, service, creatorId, pageOffset, queryKey)
  );
`;

const CREATOR_SNAPSHOT_TABLE_MYSQL = `
  CREATE TABLE IF NOT EXISTS \`CreatorSnapshot\` (
    kind VARCHAR(32) NOT NULL,
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    pageOffset INT NOT NULL DEFAULT 0,
    queryKey VARCHAR(255) NOT NULL DEFAULT '',
    data LONGTEXT NOT NULL,
    updatedAt DATETIME(3) NOT NULL,
    PRIMARY KEY (kind, site, service, creatorId, pageOffset, queryKey),
    KEY \`CreatorSnapshot_site_creator_updatedAt_idx\` (site, service, creatorId, updatedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

let localStorePromise: Promise<DataStore> | undefined;
let productionStorePromise: Promise<DataStore> | undefined;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeFavoritePostId(postId?: string | null): string {
  return postId?.trim() ?? "";
}

function normalizeCreatorSnapshotOffset(offset?: number): number {
  return Number.isFinite(offset) && Number(offset) >= 0 ? Number(offset) : 0;
}

function normalizeCreatorSnapshotQuery(query?: string | null): string {
  return query?.trim() ?? "";
}

function mapUser(row: any): StoredUser {
  return {
    id: String(row.id),
    email: String(row.email),
    totpSecret: row.totpSecret ?? null,
    totpEnabled: Boolean(row.totpEnabled),
    createdAt: toDate(row.createdAt),
  };
}

function mapKimonoSession(row: any): StoredKimonoSession {
  return {
    id: String(row.id),
    site: row.site as SupportedSite,
    cookie: String(row.cookie),
    username: String(row.username),
    savedAt: toDate(row.savedAt),
  };
}

function mapCacheRecord(row: any): StoredCacheRecord {
  return {
    id: row.id ?? undefined,
    site: row.site ?? undefined,
    kind: row.kind ?? undefined,
    data: String(row.data),
    updatedAt: toDate(row.updatedAt),
  };
}

function mapDiscoveryBlock(row: any): StoredDiscoveryBlock {
  return {
    id: String(row.id),
    site: row.site as SupportedSite,
    service: String(row.service),
    creatorId: String(row.creatorId),
    blockedAt: toDate(row.blockedAt),
  };
}

function mapFavoriteChronology(row: any): StoredFavoriteChronology {
  return {
    kind: row.kind as StoredFavoriteChronologyKind,
    site: row.site as SupportedSite,
    service: String(row.service),
    creatorId: String(row.creatorId),
    postId: normalizeFavoritePostId(row.postId) || null,
    favoritedAt: toDate(row.favoritedAt),
  };
}

async function tryRenameLocalCreatorSnapshotOffsetColumn(prisma: LocalPrismaDataStoreClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe("ALTER TABLE CreatorSnapshot RENAME COLUMN offset TO pageOffset");
  } catch {
    // Ignore when the table already uses pageOffset or does not exist yet.
  }
}

async function tryRenameProductionCreatorSnapshotOffsetColumn(db: ProductionDbModule): Promise<void> {
  try {
    await db.execute("ALTER TABLE `CreatorSnapshot` CHANGE COLUMN `offset` `pageOffset` INT NOT NULL DEFAULT 0");
  } catch {
    // Ignore when the table already uses pageOffset or does not exist yet.
  }
}

async function ensureLocalFavoriteChronologyTable(prisma: LocalPrismaDataStoreClient): Promise<void> {
  await prisma.$executeRawUnsafe(FAVORITE_CHRONOLOGY_TABLE_SQLITE);
  await prisma.$executeRawUnsafe(FAVORITE_CHRONOLOGY_INDEX_SQLITE);
  await prisma.$executeRawUnsafe(FAVORITE_SNAPSHOT_TABLE_SQLITE);
  await prisma.$executeRawUnsafe(CREATOR_SNAPSHOT_TABLE_SQLITE);
  await tryRenameLocalCreatorSnapshotOffsetColumn(prisma);
}

async function ensureProductionFavoriteChronologyTable(db: ProductionDbModule): Promise<void> {
  await db.execute(FAVORITE_CHRONOLOGY_TABLE_MYSQL);
  await db.execute(FAVORITE_SNAPSHOT_TABLE_MYSQL);
  await db.execute(CREATOR_SNAPSHOT_TABLE_MYSQL);
  await tryRenameProductionCreatorSnapshotOffsetColumn(db);
}

function buildFavoriteChronologyQuery(input?: {
  kind?: StoredFavoriteChronologyKind;
  site?: SupportedSite;
}) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (input?.kind) {
    clauses.push("kind = ?");
    values.push(input.kind);
  }

  if (input?.site) {
    clauses.push("site = ?");
    values.push(input.site);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  return {
    sql: `SELECT kind, site, service, creatorId, postId, favoritedAt FROM FavoriteChronology${whereClause} ORDER BY favoritedAt DESC`,
    values,
  };
}

function createProductionDataStore(db: ProductionDbModule): DataStore {
  return {
    async getOrCreateAdminUser() {
      let users = await db.query<any>("SELECT * FROM `User` LIMIT 1");
      let user = users[0];

      if (!user) {
        const id = crypto.randomUUID();
        await db.execute("INSERT INTO `User` (id, email) VALUES (?, ?)", [
          id,
          "admin@kimono.local",
        ]);
        users = await db.query<any>("SELECT * FROM `User` WHERE id = ?", [id]);
        user = users[0];
      }

      return mapUser(user);
    },

    async getUserById(id) {
      const users = await db.query<any>("SELECT * FROM `User` WHERE id = ?", [id]);
      return users[0] ? mapUser(users[0]) : null;
    },

    async updateUserTotpSecret(id, secret) {
      await db.execute("UPDATE `User` SET totpSecret = ? WHERE id = ?", [
        secret,
        id,
      ]);
    },

    async enableUserTotp(id) {
      await db.execute("UPDATE `User` SET totpEnabled = 1 WHERE id = ?", [id]);
    },

    async getLatestKimonoSession(site) {
      const sessions = await db.query<any>(
        "SELECT * FROM KimonoSession WHERE site = ? ORDER BY savedAt DESC LIMIT 1",
        [site]
      );
      return sessions[0] ? mapKimonoSession(sessions[0]) : null;
    },

    async getKimonoSessions() {
      const sessions = await db.query<any>(
        "SELECT * FROM KimonoSession ORDER BY savedAt DESC"
      );
      return sessions.map(mapKimonoSession);
    },

    async saveKimonoSession({ site, cookie, username }) {
      await db.execute("DELETE FROM KimonoSession WHERE site = ?", [site]);
      await db.execute(
        "INSERT INTO KimonoSession (id, site, cookie, username) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), site, cookie, username]
      );
    },

    async deleteKimonoSession(site) {
      await db.execute("DELETE FROM KimonoSession WHERE site = ?", [site]);
    },

    async getCreatorsCache(site) {
      const rows = await db.query<any>("SELECT * FROM CreatorsCache WHERE site = ?", [site]);
      return rows[0] ? mapCacheRecord(rows[0]) : null;
    },

    async setCreatorsCache(site, data, updatedAt = new Date()) {
      const jsonData = JSON.stringify(data);
      await db.execute(
        "INSERT INTO CreatorsCache (site, data, updatedAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = ?, updatedAt = ?",
        [site, jsonData, updatedAt, jsonData, updatedAt]
      );
    },

    async getDiscoveryBlocks() {
      const rows = await db.query<any>("SELECT * FROM DiscoveryBlock ORDER BY blockedAt DESC");
      return rows.map(mapDiscoveryBlock);
    },

    async blockDiscoveryCreator({ site, service, creatorId }) {
      const now = new Date();
      await db.execute(
        "INSERT INTO DiscoveryBlock (id, site, service, creatorId, blockedAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE blockedAt = ?",
        [crypto.randomUUID(), site, service, creatorId, now, now]
      );
    },

    async unblockDiscoveryCreator({ site, service, creatorId }) {
      await db.execute(
        "DELETE FROM DiscoveryBlock WHERE site = ? AND service = ? AND creatorId = ?",
        [site, service, creatorId]
      );
    },

    async getDiscoveryCache(id = "global") {
      const rows = await db.query<any>("SELECT * FROM DiscoveryCache WHERE id = ?", [id]);
      return rows[0] ? mapCacheRecord(rows[0]) : null;
    },

    async setDiscoveryCache(id, data, updatedAt = new Date()) {
      const jsonData = JSON.stringify(data);
      await db.execute(
        "INSERT INTO DiscoveryCache (id, data, updatedAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = ?, updatedAt = ?",
        [id, jsonData, updatedAt, jsonData, updatedAt]
      );
    },

    async getFavoriteSnapshot({ kind, site }) {
      const rows = await db.query<any>("SELECT * FROM FavoriteSnapshot WHERE kind = ? AND site = ?", [kind, site]);
      return rows[0] ? mapCacheRecord(rows[0]) : null;
    },

    async setFavoriteSnapshot({ kind, site, data, updatedAt = new Date() }) {
      const jsonData = JSON.stringify(data);
      await db.execute(
        "INSERT INTO FavoriteSnapshot (kind, site, data, updatedAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = ?, updatedAt = ?",
        [kind, site, jsonData, updatedAt, jsonData, updatedAt]
      );
    },

    async getCreatorSnapshot({ kind, site, service, creatorId, offset = 0, query }) {
      const rows = await db.query<any>(
        "SELECT kind, site, data, updatedAt FROM CreatorSnapshot WHERE kind = ? AND site = ? AND service = ? AND creatorId = ? AND pageOffset = ? AND queryKey = ?",
        [kind, site, service, creatorId, normalizeCreatorSnapshotOffset(offset), normalizeCreatorSnapshotQuery(query)]
      );
      return rows[0] ? mapCacheRecord(rows[0]) : null;
    },

    async setCreatorSnapshot({ kind, site, service, creatorId, data, offset = 0, query, updatedAt = new Date() }) {
      const jsonData = JSON.stringify(data);
      const normalizedOffset = normalizeCreatorSnapshotOffset(offset);
      const normalizedQuery = normalizeCreatorSnapshotQuery(query);
      await db.execute(
        "INSERT INTO CreatorSnapshot (kind, site, service, creatorId, pageOffset, queryKey, data, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = ?, updatedAt = ?",
        [kind, site, service, creatorId, normalizedOffset, normalizedQuery, jsonData, updatedAt, jsonData, updatedAt]
      );
    },

    async listFavoriteChronology(input) {
      const query = buildFavoriteChronologyQuery(input);
      const rows = await db.query<any>(query.sql, query.values as any[]);
      return rows.map(mapFavoriteChronology);
    },

    async upsertFavoriteChronology(input) {
      const favoritedAt = input.favoritedAt ?? new Date();
      await db.execute(
        "INSERT INTO FavoriteChronology (kind, site, service, creatorId, postId, favoritedAt) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE favoritedAt = VALUES(favoritedAt)",
        [
          input.kind,
          input.site,
          input.service,
          input.creatorId,
          normalizeFavoritePostId(input.postId),
          favoritedAt,
        ]
      );
    },

    async deleteFavoriteChronology(input) {
      await db.execute(
        "DELETE FROM FavoriteChronology WHERE kind = ? AND site = ? AND service = ? AND creatorId = ? AND postId = ?",
        [
          input.kind,
          input.site,
          input.service,
          input.creatorId,
          normalizeFavoritePostId(input.postId),
        ]
      );
    },

    async disconnect() {
      return Promise.resolve();
    },
  };
}

function createPrismaDataStore(prisma: LocalPrismaDataStoreClient): DataStore {
  return {
    async getOrCreateAdminUser() {
      let user = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: "admin@kimono.local",
          },
        });
      }

      return mapUser(user);
    },

    async getUserById(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? mapUser(user) : null;
    },

    async updateUserTotpSecret(id, secret) {
      await prisma.user.update({
        where: { id },
        data: { totpSecret: secret },
      });
    },

    async enableUserTotp(id) {
      await prisma.user.update({
        where: { id },
        data: { totpEnabled: true },
      });
    },

    async getLatestKimonoSession(site) {
      const session = await prisma.kimonoSession.findFirst({
        where: { site },
        orderBy: { savedAt: "desc" },
      });
      return session ? mapKimonoSession(session) : null;
    },

    async getKimonoSessions() {
      const sessions = await prisma.kimonoSession.findMany({
        orderBy: { savedAt: "desc" },
      });
      return sessions.map(mapKimonoSession);
    },

    async saveKimonoSession({ site, cookie, username }) {
      await prisma.kimonoSession.deleteMany({ where: { site } });
      await prisma.kimonoSession.create({
        data: { site, cookie, username },
      });
    },

    async deleteKimonoSession(site) {
      await prisma.kimonoSession.deleteMany({ where: { site } });
    },

    async getCreatorsCache(site) {
      const cache = await prisma.creatorsCache.findUnique({ where: { site } });
      return cache ? mapCacheRecord(cache) : null;
    },

    async setCreatorsCache(site, data, updatedAt = new Date()) {
      await prisma.creatorsCache.upsert({
        where: { site },
        create: {
          site,
          data: JSON.stringify(data),
          updatedAt,
        },
        update: {
          data: JSON.stringify(data),
          updatedAt,
        },
      });
    },

    async getDiscoveryBlocks() {
      const blocks = await prisma.discoveryBlock.findMany({
        orderBy: { blockedAt: "desc" },
      });
      return blocks.map(mapDiscoveryBlock);
    },

    async blockDiscoveryCreator({ site, service, creatorId }) {
      await prisma.discoveryBlock.deleteMany({
        where: { site, service, creatorId },
      });
      await prisma.discoveryBlock.create({
        data: {
          site,
          service,
          creatorId,
          blockedAt: new Date(),
        },
      });
    },

    async unblockDiscoveryCreator({ site, service, creatorId }) {
      await prisma.discoveryBlock.deleteMany({
        where: { site, service, creatorId },
      });
    },

    async getDiscoveryCache(id = "global") {
      const cache = await prisma.discoveryCache.findUnique({ where: { id } });
      return cache ? mapCacheRecord(cache) : null;
    },

    async setDiscoveryCache(id, data, updatedAt = new Date()) {
      await prisma.discoveryCache.upsert({
        where: { id },
        create: {
          id,
          data: JSON.stringify(data),
          updatedAt,
        },
        update: {
          data: JSON.stringify(data),
          updatedAt,
        },
      });
    },

    async getFavoriteSnapshot({ kind, site }) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        "SELECT kind, site, data, updatedAt FROM FavoriteSnapshot WHERE kind = ? AND site = ? LIMIT 1",
        kind,
        site
      );
      return rows[0] ? mapCacheRecord(rows[0]) : null;
    },

    async setFavoriteSnapshot({ kind, site, data, updatedAt = new Date() }) {
      await prisma.$executeRawUnsafe(
        "INSERT OR REPLACE INTO FavoriteSnapshot (kind, site, data, updatedAt) VALUES (?, ?, ?, ?)",
        kind,
        site,
        JSON.stringify(data),
        updatedAt.toISOString()
      );
    },

    async getCreatorSnapshot({ kind, site, service, creatorId, offset = 0, query }) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        "SELECT kind, site, data, updatedAt FROM CreatorSnapshot WHERE kind = ? AND site = ? AND service = ? AND creatorId = ? AND pageOffset = ? AND queryKey = ? LIMIT 1",
        kind,
        site,
        service,
        creatorId,
        normalizeCreatorSnapshotOffset(offset),
        normalizeCreatorSnapshotQuery(query)
      );
      return rows[0] ? mapCacheRecord(rows[0]) : null;
    },

    async setCreatorSnapshot({ kind, site, service, creatorId, data, offset = 0, query, updatedAt = new Date() }) {
      await prisma.$executeRawUnsafe(
        "INSERT OR REPLACE INTO CreatorSnapshot (kind, site, service, creatorId, pageOffset, queryKey, data, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        kind,
        site,
        service,
        creatorId,
        normalizeCreatorSnapshotOffset(offset),
        normalizeCreatorSnapshotQuery(query),
        JSON.stringify(data),
        updatedAt.toISOString()
      );
    },

    async listFavoriteChronology(input) {
      const query = buildFavoriteChronologyQuery(input);
      const rows = await prisma.$queryRawUnsafe<any[]>(query.sql, ...query.values);
      return rows.map(mapFavoriteChronology);
    },

    async upsertFavoriteChronology(input) {
      await prisma.$executeRawUnsafe(
        "INSERT OR REPLACE INTO FavoriteChronology (kind, site, service, creatorId, postId, favoritedAt) VALUES (?, ?, ?, ?, ?, ?)",
        input.kind,
        input.site,
        input.service,
        input.creatorId,
        normalizeFavoritePostId(input.postId),
        (input.favoritedAt ?? new Date()).toISOString()
      );
    },

    async deleteFavoriteChronology(input) {
      await prisma.$executeRawUnsafe(
        "DELETE FROM FavoriteChronology WHERE kind = ? AND site = ? AND service = ? AND creatorId = ? AND postId = ?",
        input.kind,
        input.site,
        input.service,
        input.creatorId,
        normalizeFavoritePostId(input.postId)
      );
    },

    async disconnect() {
      await prisma.$disconnect();
    },
  };
}

async function getProductionStore(): Promise<DataStore> {
  productionStorePromise ??= import("../db.ts").then(async (db) => {
    await ensureProductionFavoriteChronologyTable(db);
    return createProductionDataStore(db);
  });

  return productionStorePromise;
}

export async function createLocalDataStore(options?: {
  databaseUrl?: string;
}): Promise<DataStore> {
  const { getLocalPrismaClient } = await import("../prisma.ts");
  const prisma = getLocalPrismaClient(options?.databaseUrl) as unknown as LocalPrismaDataStoreClient;
  await ensureLocalFavoriteChronologyTable(prisma);
  return createPrismaDataStore(prisma);
}

export async function getDataStore(): Promise<DataStore> {
  if (isLocalDevMode()) {
    localStorePromise ??= createLocalDataStore();
    return localStorePromise;
  }

  return getProductionStore();
}
