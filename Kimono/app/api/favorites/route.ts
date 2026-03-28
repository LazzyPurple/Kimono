import { NextRequest, NextResponse } from "next/server";

import { getKimonoFavoritesPayload } from "@/lib/kimono-favorites-route";
import { getLikesPostsPayload } from "@/lib/likes-posts-route";
import { db, type KimonoSite } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

function parseSite(value: string | null): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

export async function GET(request: NextRequest) {
  const site = parseSite(request.nextUrl.searchParams.get("site"));
  if (!site) {
    return NextResponse.json({ error: "Invalid site" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const [creatorPayload, postPayload] = await Promise.all([
      getKimonoFavoritesPayload({ site }),
      getLikesPostsPayload({ site }),
    ]);

    const source = creatorPayload.expired || postPayload.expired ? "stale" : "upstream";
    return NextResponse.json({
      site,
      loggedIn: creatorPayload.loggedIn || postPayload.loggedIn,
      expired: creatorPayload.expired || postPayload.expired,
      username: creatorPayload.username ?? postPayload.username,
      creators: creatorPayload.favorites,
      posts: postPayload.items,
      source,
      dbReady: Boolean(db),
    }, {
      headers: { "x-kimono-source": source },
    });
  } catch (error) {
    await logAppError("api", "favorites GET error", error, {
      details: { route: "/api/favorites", site },
    });
    return NextResponse.json({ site, loggedIn: false, expired: true, username: null, creators: [], posts: [], source: "stale" }, { headers: { "x-kimono-source": "stale" } });
  }
}
