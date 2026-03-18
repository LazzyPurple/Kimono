const VIDEO_PREVIEW_CACHE_PREFIX = "kimono:video-preview:";

export const VIDEO_PREVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface VideoPreviewState {
  warmed: boolean;
  durationSeconds?: number | null;
}

interface StoredVideoPreviewState extends VideoPreviewState {
  expiresAt: number;
}

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface VideoPreviewCache {
  storage: MinimalStorage | null;
  prefix: string;
}

function getCacheKey(cache: VideoPreviewCache, url: string): string {
  return `${cache.prefix}${url}`;
}

function normalizeNow(now?: Date | number): number {
  if (now instanceof Date) {
    return now.getTime();
  }

  return typeof now === "number" ? now : Date.now();
}

function sanitizeDuration(durationSeconds?: number | null): number | null | undefined {
  if (durationSeconds == null) {
    return durationSeconds;
  }

  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
}

function readStoredValue(
  cache: VideoPreviewCache,
  url: string,
  now?: Date | number
): StoredVideoPreviewState | null {
  const storage = cache.storage;
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(getCacheKey(cache, url));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredVideoPreviewState;
    const currentTime = normalizeNow(now);

    if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= currentTime) {
      storage.removeItem(getCacheKey(cache, url));
      return null;
    }

    return {
      warmed: Boolean(parsed.warmed),
      durationSeconds: sanitizeDuration(parsed.durationSeconds),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    storage.removeItem(getCacheKey(cache, url));
    return null;
  }
}

export function createVideoPreviewCache(
  storage: MinimalStorage | null,
  prefix = VIDEO_PREVIEW_CACHE_PREFIX
): VideoPreviewCache {
  return { storage, prefix };
}

let defaultVideoPreviewCache: VideoPreviewCache | null = null;

export function getDefaultVideoPreviewCache(): VideoPreviewCache {
  if (!defaultVideoPreviewCache) {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    defaultVideoPreviewCache = createVideoPreviewCache(storage);
  }

  return defaultVideoPreviewCache;
}

export function readVideoPreviewState(
  cache: VideoPreviewCache,
  url: string,
  now?: Date | number
): VideoPreviewState | null {
  const storedValue = readStoredValue(cache, url, now);
  if (!storedValue) {
    return null;
  }

  return {
    warmed: storedValue.warmed,
    durationSeconds: storedValue.durationSeconds,
  };
}

export function writeVideoPreviewState(
  cache: VideoPreviewCache,
  url: string,
  state: VideoPreviewState,
  ttlMs = VIDEO_PREVIEW_CACHE_TTL_MS,
  now?: Date | number
): void {
  const storage = cache.storage;
  if (!storage) {
    return;
  }

  const currentTime = normalizeNow(now);
  const nextValue: StoredVideoPreviewState = {
    warmed: Boolean(state.warmed),
    durationSeconds: sanitizeDuration(state.durationSeconds),
    expiresAt: currentTime + ttlMs,
  };

  storage.setItem(getCacheKey(cache, url), JSON.stringify(nextValue));
}

export function markVideoPreviewWarm(
  cache: VideoPreviewCache,
  url: string,
  ttlMs = VIDEO_PREVIEW_CACHE_TTL_MS,
  now?: Date | number
): void {
  const currentState = readVideoPreviewState(cache, url, now);
  writeVideoPreviewState(
    cache,
    url,
    {
      warmed: true,
      durationSeconds: currentState?.durationSeconds,
    },
    ttlMs,
    now
  );
}

export function rememberVideoPreviewDuration(
  cache: VideoPreviewCache,
  url: string,
  durationSeconds: number | null,
  ttlMs = VIDEO_PREVIEW_CACHE_TTL_MS,
  now?: Date | number
): void {
  const currentState = readVideoPreviewState(cache, url, now);
  writeVideoPreviewState(
    cache,
    url,
    {
      warmed: currentState?.warmed ?? false,
      durationSeconds,
    },
    ttlMs,
    now
  );
}

export function hasWarmVideoPreview(
  cache: VideoPreviewCache,
  url: string,
  now?: Date | number
): boolean {
  return Boolean(readStoredValue(cache, url, now)?.warmed);
}