import { createHash } from "node:crypto";

interface SessionUpstreamCacheEntry<T> {
  value?: T;
  freshUntil: number;
  staleUntil: number;
  inFlight?: Promise<{ value: T; source: "live" | "stale" }>;
}

interface ReadSessionUpstreamCacheInput<T> {
  keyParts: string[];
  freshTtlMs: number;
  staleTtlMs: number;
  loader: () => Promise<T>;
}

const globalCache = globalThis as typeof globalThis & {
  __kimonoSessionUpstreamCache?: Map<string, SessionUpstreamCacheEntry<unknown>>;
};

function getCacheStore(): Map<string, SessionUpstreamCacheEntry<unknown>> {
  globalCache.__kimonoSessionUpstreamCache ??= new Map();
  return globalCache.__kimonoSessionUpstreamCache;
}

export function createSessionUpstreamCacheKey(keyParts: string[]): string {
  const normalized = keyParts.join("::");
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `session-upstream:${digest}`;
}

export async function readSessionUpstreamCache<T>(input: ReadSessionUpstreamCacheInput<T>): Promise<{ value: T; source: "fresh" | "live" | "stale" }> {
  const store = getCacheStore();
  const key = createSessionUpstreamCacheKey(input.keyParts);
  const now = Date.now();
  const existing = store.get(key) as SessionUpstreamCacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.freshUntil > now) {
    return { value: existing.value, source: "fresh" };
  }

  if (existing?.inFlight) {
    return existing.inFlight;
  }

  const promise = (async () => {
    try {
      const value = await input.loader();
      store.set(key, {
        value,
        freshUntil: now + input.freshTtlMs,
        staleUntil: now + Math.max(input.freshTtlMs, input.staleTtlMs),
      });
      return { value, source: "live" as const };
    } catch (error) {
      const staleEntry = store.get(key) as SessionUpstreamCacheEntry<T> | undefined;
      if (staleEntry?.value !== undefined && staleEntry.staleUntil > Date.now()) {
        return { value: staleEntry.value, source: "stale" as const };
      }
      throw error;
    } finally {
      const latest = store.get(key) as SessionUpstreamCacheEntry<T> | undefined;
      if (latest?.inFlight) {
        delete latest.inFlight;
        store.set(key, latest);
      }
    }
  })();

  store.set(key, {
    ...(existing ?? { freshUntil: 0, staleUntil: 0 }),
    inFlight: promise,
  });

  return promise;
}
