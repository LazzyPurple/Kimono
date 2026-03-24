import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type UpstreamSite = "kemono" | "coomer";
export type UpstreamBucket = "default" | "account" | "creator-read" | "post-read" | "recent-popular" | "discover";

export interface RateLimitLikeResponse {
  status?: number | null;
  headers?: Record<string, string | number | null | undefined> | null;
}

export interface UpstreamCooldownError extends Error {
  code: "UPSTREAM_COOLDOWN";
  status: 429;
  site: UpstreamSite;
  bucket: UpstreamBucket;
  retryAfterMs: number;
}

export interface UpstreamCooldownSnapshotEntry {
  site: UpstreamSite;
  bucket: UpstreamBucket;
  blockedUntil: number;
  retryAfterMs: number;
}

interface UpstreamRateGuardOptions {
  cooldownMs?: number;
  now?: () => number;
  persistPath?: string | URL | null;
}

interface PersistedCooldownState {
  version: 1;
  entries: Array<{ site: UpstreamSite; bucket: UpstreamBucket; blockedUntil: number }>;
}

const DEFAULT_COOLDOWN_MS = 15_000;
const DEFAULT_BUCKET: UpstreamBucket = "default";
const DEFAULT_PERSIST_PATH = path.join(process.cwd(), "tmp", "upstream-rate-guard.json");

function parseRetryAfterMs(value: string | number | null | undefined, nowMs: number): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value * 1000);
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const asSeconds = Number(normalized);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.trunc(asSeconds * 1000);
  }

  const asDate = new Date(normalized).getTime();
  if (Number.isFinite(asDate) && asDate > nowMs) {
    return asDate - nowMs;
  }

  return null;
}

function normalizeBucket(bucket?: string | null): UpstreamBucket {
  switch (bucket) {
    case "account":
    case "creator-read":
    case "post-read":
    case "recent-popular":
    case "discover":
      return bucket;
    default:
      return DEFAULT_BUCKET;
  }
}

function makeCooldownKey(site: UpstreamSite, bucket: UpstreamBucket): string {
  return `${site}:${bucket}`;
}

function normalizePersistPath(persistPath?: string | URL | null): string | null {
  if (persistPath == null) {
    return null;
  }

  if (persistPath instanceof URL) {
    return persistPath.protocol === "file:" ? fileURLToPath(persistPath) : null;
  }

  const trimmed = String(persistPath).trim();
  return trimmed ? trimmed : null;
}

function readPersistedCooldowns(persistPath: string | null): Map<string, number> {
  const entries = new Map<string, number>();
  if (!persistPath || !fs.existsSync(persistPath)) {
    return entries;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(persistPath, "utf8")) as PersistedCooldownState;
    for (const entry of parsed.entries ?? []) {
      if (!entry?.site || !entry?.bucket || !Number.isFinite(entry?.blockedUntil)) {
        continue;
      }
      entries.set(makeCooldownKey(entry.site, normalizeBucket(entry.bucket)), entry.blockedUntil);
    }
  } catch {
    return new Map<string, number>();
  }

  return entries;
}

function writePersistedCooldowns(persistPath: string | null, blockedUntilByKey: Map<string, number>, nowMs: number): void {
  if (!persistPath) {
    return;
  }

  const entries = Array.from(blockedUntilByKey.entries())
    .filter(([, blockedUntil]) => blockedUntil > nowMs)
    .map(([key, blockedUntil]) => {
      const [site, bucket] = key.split(":");
      return {
        site: site as UpstreamSite,
        bucket: normalizeBucket(bucket),
        blockedUntil,
      };
    });

  fs.mkdirSync(path.dirname(persistPath), { recursive: true });
  fs.writeFileSync(persistPath, JSON.stringify({ version: 1, entries }, null, 2), "utf8");
}

export function resolveUpstreamBucket(url?: string | null): UpstreamBucket {
  const normalized = String(url ?? "").toLowerCase();

  if (normalized.includes("/authentication/login") || normalized.includes("/account/") || normalized.includes("/favorites/creator/")) {
    return "account";
  }

  if (normalized.includes("/recent") || normalized.includes("/popular")) {
    return "recent-popular";
  }

  if (normalized.includes("/creators")) {
    return "discover";
  }

  if (normalized.includes("/user/") && (normalized.includes("/profile") || normalized.includes("/posts"))) {
    return "creator-read";
  }

  if (normalized.includes("/post/")) {
    return "post-read";
  }

  return DEFAULT_BUCKET;
}

export function createRateLimitError(site: UpstreamSite, retryAfterMs: number, bucket: UpstreamBucket = DEFAULT_BUCKET): UpstreamCooldownError {
  const error = new Error(`Upstream ${site} (${bucket}) is cooling down for ${retryAfterMs}ms`) as UpstreamCooldownError;
  error.name = "UpstreamCooldownError";
  error.code = "UPSTREAM_COOLDOWN";
  error.status = 429;
  error.site = site;
  error.bucket = bucket;
  error.retryAfterMs = retryAfterMs;
  return error;
}

export function createUpstreamRateGuard(options: UpstreamRateGuardOptions = {}) {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? (() => Date.now());
  const persistPath = normalizePersistPath(options.persistPath);
  const blockedUntilByKey = readPersistedCooldowns(persistPath);

  function persistState() {
    writePersistedCooldowns(persistPath, blockedUntilByKey, now());
  }

  function cleanupExpired(nowMs: number) {
    let changed = false;
    for (const [key, blockedUntil] of blockedUntilByKey.entries()) {
      if (blockedUntil <= nowMs) {
        blockedUntilByKey.delete(key);
        changed = true;
      }
    }
    if (changed) {
      persistState();
    }
  }

  return {
    canRequest(site: UpstreamSite, bucket?: UpstreamBucket): { allowed: boolean; retryAfterMs: number; reason: string | null; bucket: UpstreamBucket } {
      const normalizedBucket = normalizeBucket(bucket);
      const nowMs = now();
      cleanupExpired(nowMs);
      const blockedUntil = blockedUntilByKey.get(makeCooldownKey(site, normalizedBucket)) ?? 0;
      if (blockedUntil <= nowMs) {
        return { allowed: true, retryAfterMs: 0, reason: null, bucket: normalizedBucket };
      }

      return {
        allowed: false,
        retryAfterMs: blockedUntil - nowMs,
        reason: `upstream cooldown active for ${site}:${normalizedBucket}`,
        bucket: normalizedBucket,
      };
    },

    registerRateLimit(site: UpstreamSite, response?: RateLimitLikeResponse | null, bucket?: UpstreamBucket): number {
      const normalizedBucket = normalizeBucket(bucket);
      const nowMs = now();
      const retryHeaderMs = parseRetryAfterMs(response?.headers?.["retry-after"], nowMs);
      const nextCooldownMs = Math.max(cooldownMs, retryHeaderMs ?? 0);
      const blockedUntil = nowMs + nextCooldownMs;
      const key = makeCooldownKey(site, normalizedBucket);
      const current = blockedUntilByKey.get(key) ?? 0;
      blockedUntilByKey.set(key, Math.max(current, blockedUntil));
      persistState();
      return nextCooldownMs;
    },

    clear(site: UpstreamSite, bucket?: UpstreamBucket): void {
      if (bucket) {
        blockedUntilByKey.delete(makeCooldownKey(site, normalizeBucket(bucket)));
      } else {
        for (const key of Array.from(blockedUntilByKey.keys())) {
          if (key.startsWith(`${site}:`)) {
            blockedUntilByKey.delete(key);
          }
        }
      }
      persistState();
    },

    snapshot(): UpstreamCooldownSnapshotEntry[] {
      const nowMs = now();
      cleanupExpired(nowMs);

      return Array.from(blockedUntilByKey.entries())
        .map(([key, blockedUntil]) => {
          const [site, bucket] = key.split(":");
          return {
            site: site as UpstreamSite,
            bucket: normalizeBucket(bucket),
            blockedUntil,
            retryAfterMs: Math.max(0, blockedUntil - nowMs),
          };
        })
        .sort((left, right) => left.blockedUntil - right.blockedUntil);
    },
  };
}

const globalRateGuard = globalThis as typeof globalThis & {
  __kimonoUpstreamRateGuard?: ReturnType<typeof createUpstreamRateGuard>;
};

export function getGlobalUpstreamRateGuard(): ReturnType<typeof createUpstreamRateGuard> {
  globalRateGuard.__kimonoUpstreamRateGuard ??= createUpstreamRateGuard({ persistPath: DEFAULT_PERSIST_PATH });
  return globalRateGuard.__kimonoUpstreamRateGuard;
}
