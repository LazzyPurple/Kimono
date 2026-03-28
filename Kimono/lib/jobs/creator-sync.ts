import type { Connection } from "mysql2/promise";

import { appendAppLog, logAppError } from "../app-logger.ts";
import { TTL } from "../config/ttl.ts";
import { createUpstreamBrowserHeaders } from "../api/upstream-browser-headers.ts";
import {
  archiveStaleCreators,
  getLatestKimonoSession,
  isCreatorCatalogFresh,
  upsertCreators,
} from "../db/repository.ts";
import type { InsertCreatorRow, KimonoSite } from "../db/types.ts";
import { getGlobalUpstreamRateGuard } from "../api/upstream-rate-guard.ts";

export interface CreatorSyncResult {
  site: KimonoSite;
  inserted: number;
  updated: number;
  archived: number;
  durationMs: number;
  source: "upstream" | "skipped";
}

export interface CreatorSyncOptions {
  force?: boolean;
  sites?: KimonoSite[];
}

const SITE_BASE_URLS: Record<KimonoSite, string> = {
  kemono: "https://kemono.cr",
  coomer: "https://coomer.st",
};

const INSERT_BATCH_SIZE = 500;
const DEFAULT_SITES: KimonoSite[] = ["kemono", "coomer"];
const rateGuard = getGlobalUpstreamRateGuard();

interface UpstreamCreator {
  id: string;
  service: string;
  name: string;
  indexed?: number | null;
  updated?: number | null;
  favorited?: number | null;
  public_id?: string | null;
  relation_id?: number | null;
  dm_count?: number | null;
  share_count?: number | null;
  has_chats?: boolean | null;
  chat_count?: number | null;
  post_count?: number | null;
}

interface HttpStatusError extends Error {
  status?: number;
}

function normalizeCreatorName(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCreatorCatalog(conn: Connection, site: KimonoSite): Promise<UpstreamCreator[]> {
  const decision = rateGuard.canRequest(site, "discover");
  if (!decision.allowed) {
    throw new Error(`Creator sync blocked by cooldown for ${site}:discover (${decision.retryAfterMs}ms)`);
  }

  const session = await getLatestKimonoSession(conn, site);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTL.upstream.largePayloadTimeout);
  try {
    const response = await fetch(`${SITE_BASE_URLS[site]}/api/v1/creators`, {
      headers: createUpstreamBrowserHeaders(site, session?.cookie ?? null),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        rateGuard.registerRateLimit(site, {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        }, "discover");
      }

      const error = new Error(`Creator sync upstream failed for ${site} with status ${response.status}`) as HttpStatusError;
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(`Creator sync returned a non-array payload for ${site}`);
    }
    return payload as UpstreamCreator[];
  } finally {
    clearTimeout(timeoutId);
  }
}

function toCreatorInsertRows(site: KimonoSite, creators: UpstreamCreator[], syncedAt: Date): InsertCreatorRow[] {
  return creators
    .filter((creator) => creator && creator.id && creator.service && creator.name)
    .map((creator) => ({
      site,
      service: String(creator.service),
      creatorId: String(creator.id),
      name: String(creator.name),
      normalizedName: normalizeCreatorName(String(creator.name)),
      indexed: typeof creator.indexed === "number" ? creator.indexed : null,
      updated: typeof creator.updated === "number" ? creator.updated : null,
      favorited: Number(creator.favorited ?? 0),
      postCount: Number(creator.post_count ?? 0),
      publicId: creator.public_id ?? null,
      relationId: creator.relation_id ?? null,
      dmCount: Number(creator.dm_count ?? 0),
      shareCount: Number(creator.share_count ?? 0),
      hasChats: Boolean(creator.has_chats ?? false),
      chatCount: Number(creator.chat_count ?? 0),
      profileImageUrl: null,
      bannerImageUrl: null,
      rawIndexPayload: JSON.stringify(creator),
      rawProfilePayload: null,
      catalogSyncedAt: syncedAt,
      profileCachedAt: null,
      profileExpiresAt: null,
      archivedAt: null,
    }));
}

export async function runCreatorSync(conn: Connection, opts: CreatorSyncOptions = {}): Promise<CreatorSyncResult[]> {
  const sites = opts.sites?.length ? opts.sites : DEFAULT_SITES;
  const results: CreatorSyncResult[] = [];

  for (const site of sites) {
    const startedAt = Date.now();
    try {
      if (!opts.force && await isCreatorCatalogFresh(conn, site)) {
        results.push({ site, inserted: 0, updated: 0, archived: 0, durationMs: Date.now() - startedAt, source: "skipped" });
        continue;
      }

      const upstreamCreators = await fetchCreatorCatalog(conn, site);
      const syncedAt = new Date();
      const normalizedRows = toCreatorInsertRows(site, upstreamCreators, syncedAt);

      if (normalizedRows.length < 1000) {
        await appendAppLog({
          source: "creator-sync",
          level: "warn",
          message: `Creator sync returned an unexpectedly small catalog for ${site}`,
          details: { site, count: normalizedRows.length },
        });
      }

      let inserted = 0;
      let updated = 0;
      for (let index = 0; index < normalizedRows.length; index += INSERT_BATCH_SIZE) {
        const batch = normalizedRows.slice(index, index + INSERT_BATCH_SIZE);
        const batchResult = await upsertCreators(conn, batch);
        inserted += batchResult.inserted;
        updated += batchResult.updated;
      }

      const archived = await archiveStaleCreators(conn, site, normalizedRows.map((row) => ({ service: row.service, creatorId: row.creatorId })));
      const result: CreatorSyncResult = {
        site,
        inserted,
        updated,
        archived,
        durationMs: Date.now() - startedAt,
        source: "upstream",
      };
      results.push(result);

      await appendAppLog({
        source: "creator-sync",
        level: "info",
        message: `Creator sync completed for ${site}`,
        details: { site, inserted, updated, archived, totalProcessed: normalizedRows.length, durationMs: result.durationMs },
      });
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number((error as HttpStatusError).status ?? 0) : 0;
      if (status === 403) {
        await appendAppLog({
          source: "creator-sync",
          level: "warn",
          message: `Creator sync received HTTP 403 for ${site}; keeping existing Creator rows untouched`,
          details: { site, status },
        });
      }
      await logAppError("creator-sync", `Creator sync failed for ${site}`, error, {
        details: {
          site,
          status: status || null,
          preservedExistingCatalog: true,
        },
      });
      results.push({ site, inserted: 0, updated: 0, archived: 0, durationMs: Date.now() - startedAt, source: "skipped" });
    }
  }

  return results;
}
