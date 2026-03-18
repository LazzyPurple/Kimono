export interface BrowserDataStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserDataCache {
  storage: BrowserDataStorage | null;
  prefix: string;
  inflight: Map<string, Promise<any>>;
}

interface BrowserCacheEnvelope<T> {
  expiresAt: string;
  value: T;
}

const DEFAULT_PREFIX = "kimono:cache:v1:";
const globalBrowserCache = globalThis as typeof globalThis & {
  __kimonoBrowserDataCache?: BrowserDataCache;
};

export function createBrowserDataCache(
  storage: BrowserDataStorage | null,
  prefix = DEFAULT_PREFIX
): BrowserDataCache {
  return {
    storage,
    prefix,
    inflight: new Map(),
  };
}

function resolveStorageKey(cache: BrowserDataCache, key: string): string {
  return `${cache.prefix}${key}`;
}

export function readBrowserCacheValue<T>(
  cache: BrowserDataCache,
  key: string,
  now: Date = new Date()
): T | null {
  if (!cache.storage) {
    return null;
  }

  const raw = cache.storage.getItem(resolveStorageKey(cache, key));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as BrowserCacheEnvelope<T>;
    if (!parsed?.expiresAt) {
      cache.storage.removeItem(resolveStorageKey(cache, key));
      return null;
    }

    if (new Date(parsed.expiresAt).getTime() <= now.getTime()) {
      cache.storage.removeItem(resolveStorageKey(cache, key));
      return null;
    }

    return parsed.value ?? null;
  } catch {
    cache.storage.removeItem(resolveStorageKey(cache, key));
    return null;
  }
}

export function writeBrowserCacheValue<T>(
  cache: BrowserDataCache,
  key: string,
  value: T,
  ttlMs: number,
  now: Date = new Date()
): void {
  if (!cache.storage) {
    return;
  }

  const envelope: BrowserCacheEnvelope<T> = {
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    value,
  };

  cache.storage.setItem(resolveStorageKey(cache, key), JSON.stringify(envelope));
}

export function getDefaultBrowserDataCache(): BrowserDataCache {
  if (!globalBrowserCache.__kimonoBrowserDataCache) {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    globalBrowserCache.__kimonoBrowserDataCache = createBrowserDataCache(storage);
  }

  return globalBrowserCache.__kimonoBrowserDataCache;
}

export async function fetchJsonWithBrowserCache<T>(input: {
  key: string;
  ttlMs: number;
  loader: () => Promise<T>;
  cache?: BrowserDataCache;
  shouldCache?: (value: T) => boolean;
}): Promise<T> {
  const cache = input.cache ?? getDefaultBrowserDataCache();
  const cached = readBrowserCacheValue<T>(cache, input.key);
  if (cached !== null) {
    return cached;
  }

  const inflight = cache.inflight.get(input.key);
  if (inflight) {
    return inflight;
  }

  const promise = input.loader().then((value) => {
    if (input.shouldCache ? input.shouldCache(value) : true) {
      writeBrowserCacheValue(cache, input.key, value, input.ttlMs);
    }
    return value;
  }).finally(() => {
    cache.inflight.delete(input.key);
  });

  cache.inflight.set(input.key, promise);
  return promise;
}
