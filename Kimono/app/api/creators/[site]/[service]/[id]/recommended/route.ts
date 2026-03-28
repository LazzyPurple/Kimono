import { NextRequest, NextResponse } from "next/server";

import { createUpstreamBrowserHeaders } from "@/lib/api/upstream-browser-headers";
import { getGlobalUpstreamRateGuard } from "@/lib/api/upstream-rate-guard";
import { TTL } from "@/lib/config/ttl";
import { db, type KimonoSite } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

const rateGuard = getGlobalUpstreamRateGuard();

function parseSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

function getBaseUrl(site: KimonoSite): string {
  return site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ site: string; service: string; id: string }> }
) {
  const params = await context.params;
  const site = parseSite(params.site);
  const service = params.service?.trim() ?? "";
  const creatorId = params.id?.trim() ?? "";

  if (!site || !service || !creatorId) {
    return NextResponse.json({ error: "Invalid creator params" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  const decision = rateGuard.canRequest(site, "discover");
  if (!decision.allowed) {
    return NextResponse.json([], { status: 200, headers: { "x-kimono-source": "stale", "Retry-After": String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))) } });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTL.upstream.defaultTimeout);

  try {
    const response = await fetch(`${getBaseUrl(site)}/api/v1/${service}/user/${creatorId}/recommended`, {
      headers: createUpstreamBrowserHeaders(site),
      signal: controller.signal,
    });

    if (response.status === 429) {
      rateGuard.registerRateLimit(site, { status: response.status, headers: { "retry-after": response.headers.get("retry-after") } }, "discover");
      return NextResponse.json([], { headers: { "x-kimono-source": "stale" } });
    }

    if (!response.ok) {
      return NextResponse.json([], { headers: { "x-kimono-source": "stale" } });
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        "x-kimono-source": "upstream",
        "x-kimono-db-ready": Boolean(db).toString(),
      },
    });
  } catch (error) {
    await logAppError("api", "creators recommended route error", error, {
      details: { route: "/api/creators/[site]/[service]/[id]/recommended", site, service, creatorId },
    });
    return NextResponse.json([], { headers: { "x-kimono-source": "stale" } });
  } finally {
    clearTimeout(timeoutId);
  }
}
