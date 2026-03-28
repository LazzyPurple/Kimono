import { db, withDbConnection, type KimonoSessionRow, type KimonoSite } from "./db/index.ts";
import { logAppError } from "./app-logger.ts";

type SessionStore = {
  getLatestKimonoSession(site: KimonoSite): Promise<KimonoSessionRow | null>;
  deleteKimonoSession(site: KimonoSite): Promise<void>;
  disconnect(): Promise<void>;
};

type SessionMutationStore = Pick<SessionStore, "deleteKimonoSession" | "disconnect">;

async function createDefaultSessionStore(): Promise<SessionStore> {
  return {
    async getLatestKimonoSession(site) {
      return withDbConnection((conn) => db.getLatestKimonoSession(conn as never, site));
    },
    async deleteKimonoSession(site) {
      await withDbConnection((conn) => db.deleteKimonoSession(conn as never, site));
    },
    async disconnect() {
      return;
    },
  };
}

export async function loadStoredKimonoSessionRecord(
  site: KimonoSite,
  options?: {
    getStore?: () => Promise<SessionStore>;
  }
): Promise<KimonoSessionRow | null> {
  let store: SessionStore | undefined;

  try {
    store = await (options?.getStore ?? createDefaultSessionStore)();
    return (await store.getLatestKimonoSession(site)) ?? null;
  } catch (error) {
    await logAppError("db", "kimono session lookup failed", error, {
      details: {
        operation: "getLatestKimonoSession",
        site,
      },
    });
    return null;
  } finally {
    try {
      await store?.disconnect();
    } catch {
      // Ignore disconnect errors for session lookups.
    }
  }
}

export async function loadStoredKimonoSessionCookie(
  site: KimonoSite,
  options?: {
    getStore?: () => Promise<SessionStore>;
  }
): Promise<string | null> {
  const session = await loadStoredKimonoSessionRecord(site, options);
  return session?.cookie ?? null;
}

export async function deleteStoredKimonoSessionRecord(
  site: KimonoSite,
  options?: {
    getStore?: () => Promise<SessionMutationStore>;
  }
): Promise<boolean> {
  let store: SessionMutationStore | undefined;

  try {
    store = await (options?.getStore ?? createDefaultSessionStore)();
    await store.deleteKimonoSession(site);
    return true;
  } catch (error) {
    await logAppError("db", "kimono session deletion failed", error, {
      details: {
        operation: "deleteKimonoSession",
        site,
      },
    });
    return false;
  } finally {
    try {
      await store?.disconnect();
    } catch {
      // Ignore disconnect errors for session deletion.
    }
  }
}
