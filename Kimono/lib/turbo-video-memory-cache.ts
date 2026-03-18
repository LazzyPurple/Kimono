export const TURBO_VIDEO_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

export interface TurboVideoChunkEntry {
  buffer: ArrayBuffer;
  totalSize: number;
  expiresAt: number;
}

export interface TurboVideoMemoryCache {
  entries: Map<string, TurboVideoChunkEntry>;
}

function normalizeNow(now?: number): number {
  return typeof now === "number" ? now : Date.now();
}

export function createTurboVideoMemoryCache(): TurboVideoMemoryCache {
  return {
    entries: new Map(),
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
  cache.entries.set(url, {
    buffer,
    totalSize,
    expiresAt: normalizeNow(now) + ttlMs,
  });
}

export function readTurboVideoChunk(
  cache: TurboVideoMemoryCache,
  url: string,
  now?: number
): TurboVideoChunkEntry | null {
  const entry = cache.entries.get(url);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= normalizeNow(now)) {
    cache.entries.delete(url);
    return null;
  }

  return entry;
}