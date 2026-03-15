import { getDataStore } from "@/lib/data-store";

const CACHE_TTL_MS = 10 * 60 * 1000;

export async function getCachedCreators(site: string): Promise<any[] | null> {
  const store = await getDataStore();
  const row = await store.getCreatorsCache(site);

  if (!row) {
    return null;
  }

  if (Date.now() - row.updatedAt.getTime() > CACHE_TTL_MS) {
    return null;
  }

  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

export async function setCachedCreators(site: string, data: any[]): Promise<void> {
  const store = await getDataStore();
  await store.setCreatorsCache(site, data, new Date());
}
