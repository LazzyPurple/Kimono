import crypto from "node:crypto";

import type { KimonoSite } from "./types.ts";
import { execute, query } from "../db.ts";

export type SupportedSite = KimonoSite;

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
  disconnect(): Promise<void>;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(String(value));
}

function mapUser(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    email: String(row.email),
    totpSecret: row.totpSecret ? String(row.totpSecret) : null,
    totpEnabled: Boolean(Number(row.totpEnabled ?? 0)),
    createdAt: toDate(row.createdAt ?? new Date(0)),
  };
}

function mapKimonoSession(row: Record<string, unknown>): StoredKimonoSession {
  return {
    id: String(row.id),
    site: String(row.site) as SupportedSite,
    cookie: String(row.cookie),
    username: String(row.username),
    savedAt: toDate(row.savedAt ?? new Date(0)),
  };
}

function createDataStore(): DataStore {
  return {
    async getOrCreateAdminUser() {
      let users = await query<Record<string, unknown>>("SELECT * FROM `User` ORDER BY createdAt ASC LIMIT 1");
      let user = users[0];

      if (!user) {
        const id = crypto.randomUUID();
        await execute("INSERT INTO `User` (id, email) VALUES (?, ?)", [id, "admin@kimono.local"]);
        users = await query<Record<string, unknown>>("SELECT * FROM `User` WHERE id = ? LIMIT 1", [id]);
        user = users[0];
      }

      return mapUser(user);
    },

    async getUserById(id) {
      const users = await query<Record<string, unknown>>("SELECT * FROM `User` WHERE id = ? LIMIT 1", [id]);
      return users[0] ? mapUser(users[0]) : null;
    },

    async updateUserTotpSecret(id, secret) {
      await execute("UPDATE `User` SET totpSecret = ? WHERE id = ?", [secret, id]);
    },

    async enableUserTotp(id) {
      await execute("UPDATE `User` SET totpEnabled = 1 WHERE id = ?", [id]);
    },

    async getLatestKimonoSession(site) {
      const rows = await query<Record<string, unknown>>("SELECT * FROM `KimonoSession` WHERE site = ? ORDER BY savedAt DESC LIMIT 1", [site]);
      return rows[0] ? mapKimonoSession(rows[0]) : null;
    },

    async getKimonoSessions() {
      const rows = await query<Record<string, unknown>>("SELECT * FROM `KimonoSession` ORDER BY savedAt DESC");
      return rows.map(mapKimonoSession);
    },

    async saveKimonoSession({ site, cookie, username }) {
      await execute("DELETE FROM `KimonoSession` WHERE site = ?", [site]);
      await execute(
        "INSERT INTO `KimonoSession` (id, site, cookie, username, savedAt) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), site, cookie, username, new Date()]
      );
    },

    async deleteKimonoSession(site) {
      await execute("DELETE FROM `KimonoSession` WHERE site = ?", [site]);
    },

    async disconnect() {
      return;
    },
  };
}

const globalForAuthStore = globalThis as typeof globalThis & {
  __kimonoAuthStore?: DataStore;
};

export async function getDataStore(): Promise<DataStore> {
  if (!globalForAuthStore.__kimonoAuthStore) {
    globalForAuthStore.__kimonoAuthStore = createDataStore();
  }

  return globalForAuthStore.__kimonoAuthStore;
}
