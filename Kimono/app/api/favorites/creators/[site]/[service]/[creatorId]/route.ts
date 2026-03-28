import { NextRequest, NextResponse } from "next/server";

import { createUpstreamBrowserHeaders } from "@/lib/api/upstream-browser-headers";
import { getGlobalUpstreamRateGuard } from "@/lib/api/upstream-rate-guard";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";
import { db, withDbConnection, type KimonoSite } from "@/lib/db/index";
import { TTL } from "@/lib/config/ttl";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

const rateGuard = getGlobalUpstreamRateGuard();

function parseSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

function getBaseUrl(site: KimonoSite): string {
  return site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
}

function buildRateLimitedResponse(site: KimonoSite, retryAfterMs: number) {
  const safeRetryAfterMs = Math.max(1000, retryAfterMs || 15000);
  return NextResponse.json({ error: "Upstream rate limited", retryAfterMs: safeRetryAfterMs }, {
    status: 429,
    headers: {
      "Retry-After": String(Math.max(1, Math.ceil(safeRetryAfterMs / 1000))),
      "x-kimono-source": "stale",
    },
  });
}

async function mutateFavorite(method: "POST" | "DELETE", input: { site: KimonoSite; service: string; creatorId: string; cookie: string }) {
  const decision = rateGuard.canRequest(input.site, "account");
  if (!decision.allowed) {
    return { ok: false as const, retryAfterMs: decision.retryAfterMs };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTL.upstream.defaultTimeout);
  try {
    const response = await fetch(`${getBaseUrl(input.site)}/api/v1/favorites/creator/${input.service}/${input.creatorId}`, {
      method,
      headers: createUpstreamBrowserHeaders(input.site, input.cookie),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const retryAfterMs = rateGuard.registerRateLimit(input.site, {
        status: response.status,
        headers: { "retry-after": response.headers.get("retry-after") },
      }, "account");
      return { ok: false as const, retryAfterMs };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false as const, retryAfterMs: 0, unauthorized: true };
    }

    if (!response.ok) {
      throw new Error(`favorite creator mutation failed: ${response.status}`);
    }

    return { ok: true as const };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function persistChronology(site: KimonoSite, service: string, creatorId: string, action: "upsert" | "delete") {
  await withDbConnection(async (conn) => {
    if (action === "upsert") {
      await db.upsertFavoriteChronologyEntry(conn as any, {
        kind: "creator",
        site,
        service,
        creatorId,
        postId: "",
        favoritedAt: new Date(),
        lastConfirmedAt: new Date(),
        favedSeq: null,
      });
      return;
    }

    await db.deleteFavoriteChronologyEntry(conn as any, "creator", site, service, creatorId);
  });
}

async function handleMutation(request: NextRequest, method: "POST" | "DELETE", params: { site: string; service: string; creatorId: string }) {
  const site = parseSite(params.site);
  const service = params.service?.trim() ?? "";
  const creatorId = params.creatorId?.trim() ?? "";

  if (!site || !service || !creatorId) {
    return NextResponse.json({ error: "Invalid favorite creator params" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401, headers: { "x-kimono-source": "stale" } });
    }

    const result = await mutateFavorite(method, { site, service, creatorId, cookie });
    if (!result.ok) {
      if ((result as { unauthorized?: boolean }).unauthorized) {
        return NextResponse.json({ error: "Session expired" }, { status: 401, headers: { "x-kimono-source": "stale" } });
      }
      return buildRateLimitedResponse(site, result.retryAfterMs);
    }

    await persistChronology(site, service, creatorId, method === "POST" ? "upsert" : "delete");
    return NextResponse.json({ ok: true }, { headers: { "x-kimono-source": "upstream" } });
  } catch (error) {
    await logAppError("api", "favorite creator mutation error", error, {
      details: { route: "/api/favorites/creators/[site]/[service]/[creatorId]", method, site: params.site, service, creatorId },
    });
    return NextResponse.json({ error: "Failed" }, { status: 503, headers: { "x-kimono-source": "stale" } });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ site: string; service: string; creatorId: string }> }) {
  return handleMutation(request, "POST", await context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ site: string; service: string; creatorId: string }> }) {
  return handleMutation(request, "DELETE", await context.params);
}



