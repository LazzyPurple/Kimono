import { NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { logAppError } from "@/lib/app-logger";
import type { PopularPeriod } from "@/lib/perf-cache";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

function parsePeriod(value: string | null): PopularPeriod {
  return value === "day" || value === "week" || value === "month" ? value : "recent";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const site = searchParams.get("site");
  const period = parsePeriod(searchParams.get("period"));
  const date = searchParams.get("date");
  const offset = Number(searchParams.get("offset") ?? 0) || 0;

  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Invalid site" }, { status: 400 });
  }

  try {
    const result = await hybridContent.getPopularPosts({
      site,
      period,
      date,
      offset,
    });

    return NextResponse.json(result, {
      headers: {
        "x-kimono-source": result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "popular-posts error", error, {
      details: {
        route: "/api/popular-posts",
        site,
        period,
        date: date ?? null,
        offset,
      },
    });

    return NextResponse.json({ posts: [], info: null, props: null, source: "empty" });
  }
}
