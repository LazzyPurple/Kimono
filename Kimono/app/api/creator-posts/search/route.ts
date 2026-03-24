import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { logAppError } from "@/lib/app-logger";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";
import type { Site } from "@/lib/api/unified";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site") as Site;
  const service = searchParams.get("service") ?? "";
  const id = searchParams.get("id") ?? "";
  const query = searchParams.get("q") || undefined;
  const media = searchParams.get("media") || "all";
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawPerPage = Number(searchParams.get("perPage") ?? "50");
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1;
  const perPage = Number.isFinite(rawPerPage) && rawPerPage > 0 ? Math.min(100, Math.trunc(rawPerPage)) : 50;

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Parametres manquants" }, { status: 400 });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);
    const result = await hybridContent.searchCreatorPosts({
      site,
      service,
      creatorId: id,
      query,
      media,
      page,
      perPage,
      cookie: cookie ?? undefined,
    });

    return NextResponse.json(result, {
      headers: {
        "x-kimono-source": result.source,
        "x-kimono-cache": result.cache.hit ? "hit" : "miss",
        "x-kimono-stale": result.cache.stale ? "1" : "0",
        "x-kimono-truncated": result.truncated ? "1" : "0",
      },
    });
  } catch (error) {
    await logAppError("api", "creator-posts search error", error, {
      details: {
        route: "/api/creator-posts/search",
        site,
        service,
        creatorId: id,
        query: query ?? null,
        media,
        page,
        perPage,
      },
    });
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
