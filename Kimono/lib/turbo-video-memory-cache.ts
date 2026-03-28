export const TURBO_VIDEO_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TURBO_VIDEO_MAX_ENTRIES = 8;
const DEFAULT_TURBO_VIDEO_MAX_BYTES = 64 * 1024 * 1024;

export interface TurboVideoChunkEntry {
  buffer: ArrayBuffer;
  totalSize: number;
  expiresAt: number;
  lastAccessedAt: number;
}

export interface TurboVideoMemoryCache {
  entries: Map<string, TurboVideoChunkEntry>;
  maxEntries: number;
  maxBytes: number;
  totalBytes: number;
}

interface TurboVideoMemoryCacheOptions {
  maxEntries?: number;
  maxBytes?: number;
}

function normalizeNow(now?: number): number {
  return typeof now === "number" ? now : Date.now();
}

function getEntrySize(entry: { buffer: ArrayBuffer }): number {
  return entry.buffer.byteLength;
}

function deleteEntry(cache: TurboVideoMemoryCache, url: string): void {
  const existing = cache.entries.get(url);
  if (!existing) {
    return;
  }

  cache.totalBytes = Math.max(0, cache.totalBytes - getEntrySize(existing));
  cache.entries.delete(url);
}

function evictExpiredEntries(cache: TurboVideoMemoryCache, now: number): void {
  for (const [url, entry] of cache.entries) {
    if (entry.expiresAt <= now) {
      deleteEntry(cache, url);
    }
  }
}

function evictToFit(cache: TurboVideoMemoryCache): void {
  while (cache.entries.size > cache.maxEntries || cache.totalBytes > cache.maxBytes) {
    let oldestUrl: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [url, entry] of cache.entries) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestUrl = url;
      }
    }

    if (!oldestUrl) {
      return;
    }

    deleteEntry(cache, oldestUrl);
  }
}

export function createTurboVideoMemoryCache(options: TurboVideoMemoryCacheOptions = {}): TurboVideoMemoryCache {
  return {
    entries: new Map(),
    maxEntries: options.maxEntries ?? DEFAULT_TURBO_VIDEO_MAX_ENTRIES,
    maxBytes: options.maxBytes ?? DEFAULT_TURBO_VIDEO_MAX_BYTES,
    totalBytes: 0,
  };
}

const globalTurboVideoMemoryCache = createTurboVideoMemoryCache();

export function getDefaultTurboVideoMemoryCache(): TurboVideoMemoryCache {
  return globalTurboVideoMemoryCache;
}

export function writeTurboVideoChunk(
  cache: TurboVideoMemoryCache,
  url: string,
  buffer: ArrayBuffer,
  totalSize: number,
  ttlMs = TURBO_VIDEO_MEMORY_TTL_MS,
  now?: number
): void {
  const currentTime = normalizeNow(now);
  evictExpiredEntries(cache, currentTime);
  deleteEntry(cache, url);

  const entry: TurboVideoChunkEntry = {
    buffer,
    totalSize,
    expiresAt: currentTime + ttlMs,
    lastAccessedAt: currentTime,
  };

  cache.entries.set(url, entry);
  cache.totalBytes += getEntrySize(entry);
  evictToFit(cache);
}

export function readTurboVideoChunk(
  cache: TurboVideoMemoryCache,
  url: string,
  now?: number
): TurboVideoChunkEntry | null {
  const currentTime = normalizeNow(now);
  evictExpiredEntries(cache, currentTime);

  const entry = cache.entries.get(url);
  if (!entry) {
    return null;
  }

  entry.lastAccessedAt = currentTime;
  return entry;
}
