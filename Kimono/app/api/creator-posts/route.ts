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
  const offset = Number(searchParams.get("offset") ?? 0);
  const query = searchParams.get("q") || undefined;

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Parametres manquants" }, { status: 400 });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);
    const result = await hybridContent.getCreatorPosts({
      site,
      service,
      creatorId: id,
      offset,
      cookie: cookie ?? undefined,
      query,
    });

    return NextResponse.json(result.posts, {
      headers: {
        "x-kimono-source": result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "creator-posts error", error, {
      details: {
        route: "/api/creator-posts",
        site,
        service,
        creatorId: id,
        offset,
        query: query ?? null,
      },
    });
    return NextResponse.json([], { status: 200 });
  }
}

