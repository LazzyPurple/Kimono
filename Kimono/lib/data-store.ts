import { isLocalDevMode } from "./local-dev-mode.ts";
import type { PrismaClient } from "@prisma/client";

export type SupportedSite = "kemono" | "coomer";

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
  disconnect(): Promise<void>;
}

type ProductionDbModule = typeof import("./db.ts");

let localStorePromise: Promise<DataStore> | undefined;
let productionStorePromise: Promise<DataStore> | undefined;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
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

    async disconnect() {
      return Promise.resolve();
    },
  };
}

function createPrismaDataStore(prisma: PrismaClient): DataStore {
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

    async disconnect() {
      await prisma.$disconnect();
    },
  };
}

async function getProductionStore(): Promise<DataStore> {
  productionStorePromise ??= import("./db.ts").then((db) =>
    createProductionDataStore(db)
  );

  return productionStorePromise;
}

export async function createLocalDataStore(options?: {
  databaseUrl?: string;
}): Promise<DataStore> {
  const { getLocalPrismaClient } = await import("./prisma.ts");
  const prisma = getLocalPrismaClient(options?.databaseUrl);
  return createPrismaDataStore(prisma);
}

export async function getDataStore(): Promise<DataStore> {
  if (isLocalDevMode()) {
    localStorePromise ??= createLocalDataStore();
    return localStorePromise;
  }

  return getProductionStore();
}


