import { TTL } from "../config/ttl.ts";

const CACHE_TTL_MS = TTL.discover.cache;

type CachedEntry = {
  data: any[];
  updatedAt: Date;
};

const creatorCatalogCache = new Map<string, CachedEntry>();

export async function getCachedCreators(site: string): Promise<any[] | null> {
  const entry = creatorCatalogCache.get(site);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.updatedAt.getTime() > CACHE_TTL_MS) {
    creatorCatalogCache.delete(site);
    return null;
  }

  return entry.data;
}

export async function setCachedCreators(site: string, data: any[]): Promise<void> {
  creatorCatalogCache.set(site, {
    data,
    updatedAt: new Date(),
  });
}
