import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { logAppError } from "@/lib/app-logger";
import { getGlobalUpstreamRateGuard } from "@/lib/api/upstream-rate-guard";
import { getDataStore, type SupportedSite } from "@/lib/data-store";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";
import { getKimonoFavoritesPayload } from "@/lib/kimono-favorites-route";

export const dynamic = "force-dynamic";

const rateGuard = getGlobalUpstreamRateGuard();

function getBaseUrl(site: SupportedSite) {
  return site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
}

function toRateLimitHeaders(headers?: Record<string, unknown>): { "retry-after"?: string } | undefined {
  const retryAfter = headers?.["retry-after"];
  if (typeof retryAfter === "string" && retryAfter.trim()) {
    return { "retry-after": retryAfter };
  }
  return undefined;
}

async function performFavoriteCreatorMutation(input: {
  method: "POST" | "DELETE";
  site: SupportedSite;
  service: string;
  creatorId: string;
  cookie: string;
}): Promise<{ ok: true } | { ok: false; status: 401 | 429; retryAfterMs?: number }> {
  const decision = rateGuard.canRequest(input.site, "account");
  if (!decision.allowed) {
    return { ok: false, status: 429, retryAfterMs: decision.retryAfterMs };
  }

  try {
    await axios({
      method: input.method,
      url: `${getBaseUrl(input.site)}/api/v1/favorites/creator/${input.service}/${input.creatorId}`,
      headers: {
        Cookie: input.cookie,
        Accept: "text/css",
      },
      timeout: 15000,
    });
    return { ok: true };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      if (status === 429) {
        const retryAfterMs = rateGuard.registerRateLimit(input.site, {
          status,
          headers: toRateLimitHeaders(error.response?.headers),
        }, "account");
        return { ok: false, status: 429, retryAfterMs };
      }

      if (status === 401 || status === 403) {
        return { ok: false, status: 401 };
      }
    }

    throw error;
  }
}

async function persistFavoriteChronology(input: {
  kind: "creator";
  site: SupportedSite;
  service: string;
  creatorId: string;
  action: "upsert" | "delete";
}) {
  const store = await getDataStore();

  try {
    if (input.action === "upsert") {
      await store.upsertFavoriteChronology({
        kind: input.kind,
        site: input.site,
        service: input.service,
        creatorId: input.creatorId,
        favoritedAt: new Date(),
      });
      return;
    }

    await store.deleteFavoriteChronology({
      kind: input.kind,
      site: input.site,
      service: input.service,
      creatorId: input.creatorId,
    });
  } finally {
    await store.disconnect();
  }
}

function buildRateLimitedResponse(retryAfterMs?: number) {
  const safeRetryAfterMs = Math.max(1000, retryAfterMs ?? 15000);
  return NextResponse.json(
    {
      error: "Upstream rate limited",
      retryAfterMs: safeRetryAfterMs,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(safeRetryAfterMs / 1000))),
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site");
  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json([]);
  }

  const payload = await getKimonoFavoritesPayload({ site });
  return NextResponse.json(payload.favorites ?? []);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId } = body;
    if (!service || !creatorId || (site !== "kemono" && site !== "coomer")) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    const mutation = await performFavoriteCreatorMutation({
      method: "POST",
      site,
      service,
      creatorId,
      cookie,
    });

    if (!mutation.ok) {
      if (mutation.status === 429) {
        return buildRateLimitedResponse(mutation.retryAfterMs);
      }

      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    try {
      await persistFavoriteChronology({
        kind: "creator",
        site,
        service,
        creatorId,
        action: "upsert",
      });
    } catch (chronologyError) {
      await logAppError("db", "likes/creators chronology upsert failed", chronologyError, {
        details: {
          route: "/api/likes/creators",
          method: "POST",
          site,
          service,
          creatorId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAppError("api", "likes/creators POST error", error, {
      details: {
        route: "/api/likes/creators",
        method: "POST",
      },
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId } = body;
    if (!service || !creatorId || (site !== "kemono" && site !== "coomer")) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    const mutation = await performFavoriteCreatorMutation({
      method: "DELETE",
      site,
      service,
      creatorId,
      cookie,
    });

    if (!mutation.ok) {
      if (mutation.status === 429) {
        return buildRateLimitedResponse(mutation.retryAfterMs);
      }

      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    try {
      await persistFavoriteChronology({
        kind: "creator",
        site,
        service,
        creatorId,
        action: "delete",
      });
    } catch (chronologyError) {
      await logAppError("db", "likes/creators chronology delete failed", chronologyError, {
        details: {
          route: "/api/likes/creators",
          method: "DELETE",
          site,
          service,
          creatorId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAppError("api", "likes/creators DELETE error", error, {
      details: {
        route: "/api/likes/creators",
        method: "DELETE",
      },
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
