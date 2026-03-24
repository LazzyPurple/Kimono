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
  const scope = searchParams.get("scope") === "snapshot" ? "snapshot" : "page";
  const media = searchParams.get("media") || "tout";

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Parametres manquants" }, { status: 400 });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);

    if (scope === "snapshot") {
      const result = await hybridContent.getCreatorPostsSnapshotScope({
        site,
        service,
        creatorId: id,
        query,
        media: media === "images" || media === "videos" ? media : "tout",
      });

      return NextResponse.json(result, {
        headers: {
          "x-kimono-source": result.source,
          "x-kimono-scope": result.scope,
          "x-kimono-partial": result.partial ? "1" : "0",
        },
      });
    }

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
        scope,
        media,
      },
    });
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
