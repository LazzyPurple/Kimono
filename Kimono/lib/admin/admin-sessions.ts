import { getDataStore } from "@/lib/db/index";

export async function getAdminSessionsData() {
  const store = await getDataStore();

  try {
    const [sessions, adminUser] = await Promise.all([
      store.getKimonoSessions(),
      store.getOrCreateAdminUser(),
    ]);

    return {
      sessions,
      totpEnabled: adminUser.totpEnabled,
    };
  } finally {
    await store.disconnect();
  }
}

export async function disconnectAdminSession(site: "kemono" | "coomer") {
  const store = await getDataStore();
  try {
    await store.deleteKimonoSession(site);
    return {
      ok: true,
      site,
      message: `Session ${site} deconnectee.`,
    };
  } finally {
    await store.disconnect();
  }
}

