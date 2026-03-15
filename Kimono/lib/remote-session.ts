import {
  getDataStore,
  type DataStore,
  type StoredKimonoSession,
  type SupportedSite,
} from "./data-store.ts";
import { logAppError } from "./app-logger.ts";

type SessionStore = Pick<DataStore, "getLatestKimonoSession" | "disconnect">;
type SessionMutationStore = Pick<DataStore, "deleteKimonoSession" | "disconnect">;

export async function loadStoredKimonoSessionRecord(
  site: SupportedSite,
  options?: {
    getStore?: () => Promise<SessionStore>;
  }
): Promise<StoredKimonoSession | null> {
  let store: SessionStore | undefined;

  try {
    store = await (options?.getStore ?? getDataStore)();
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
  site: SupportedSite,
  options?: {
    getStore?: () => Promise<SessionStore>;
  }
): Promise<string | null> {
  const session = await loadStoredKimonoSessionRecord(site, options);
  return session?.cookie ?? null;
}

export async function deleteStoredKimonoSessionRecord(
  site: SupportedSite,
  options?: {
    getStore?: () => Promise<SessionMutationStore>;
  }
): Promise<boolean> {
  let store: SessionMutationStore | undefined;

  try {
    store = await (options?.getStore ?? getDataStore)();
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

