import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import type { PopularPeriod } from "@/lib/db/index";
import { db, withDbConnection, type KimonoSite } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

function parseSite(value: string | null): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

function parsePeriod(value: string | null): PopularPeriod {
  return value === "day" || value === "week" || value === "month" ? value : "recent";
}

export async function GET(request: NextRequest) {
  const site = parseSite(request.nextUrl.searchParams.get("site"));
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  const date = request.nextUrl.searchParams.get("date");
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? "0") || 0);

  if (!site) {
    return NextResponse.json({ error: "Invalid site" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const cachedPosts = await withDbConnection((conn) => db.getPopularPosts(conn as any, site, period, date ?? undefined, offset, 50));
    if (cachedPosts.length > 0) {
      return NextResponse.json({ posts: cachedPosts, info: null, props: null, source: "db" }, {
        headers: { "x-kimono-source": "db" },
      });
    }

    const result = await hybridContent.getPopularPosts({ site, period, date, offset });
    return NextResponse.json(result, {
      headers: {
        "x-kimono-source": result.source === "cache" ? "db" : result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "posts/popular route error", error, {
      details: { route: "/api/posts/popular", site, period, date: date ?? null, offset },
    });
    return NextResponse.json({ posts: [], info: null, props: null, source: "stale" }, { headers: { "x-kimono-source": "stale" } });
  }
}


