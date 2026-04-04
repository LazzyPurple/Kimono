import { collectAuthDebugSnapshot } from "../auth-debug-route.ts";
import { getDataStore, type StoredKimonoSession } from "../db/index.ts";

export interface AdminSessionsSnapshot {
  sessions: Pick<StoredKimonoSession, "site" | "username" | "savedAt">[];
  totpEnabled: boolean;
  adminUserExists: boolean;
}

interface AdminSessionsDependencies {
  getKimonoSessions?: () => Promise<Pick<StoredKimonoSession, "site" | "username" | "savedAt">[]>;
  getAuthSnapshot?: () => Promise<{
    database:
      | { ok: true; adminUser: { exists: boolean; totpEnabled: boolean } }
      | { ok: false };
  }>;
}

async function defaultGetKimonoSessions() {
  const store = await getDataStore();
  try {
    return await store.getKimonoSessions();
  } finally {
    await store.disconnect();
  }
}

async function defaultGetAuthSnapshot() {
  return collectAuthDebugSnapshot();
}

export function createAdminSessionsService(dependencies: AdminSessionsDependencies = {}) {
  return {
    async getSnapshot(): Promise<AdminSessionsSnapshot> {
      const [sessions, auth] = await Promise.all([
        (dependencies.getKimonoSessions ?? defaultGetKimonoSessions)(),
        (dependencies.getAuthSnapshot ?? defaultGetAuthSnapshot)(),
      ]);

      const database = auth.database;

      return {
        sessions: [...sessions].sort((left, right) => right.savedAt.getTime() - left.savedAt.getTime()),
        totpEnabled: database.ok ? database.adminUser.totpEnabled : false,
        adminUserExists: database.ok ? database.adminUser.exists : false,
      };
    },
  };
}

export async function getAdminSessionsData() {
  return createAdminSessionsService().getSnapshot();
}
