import { NextRequest, NextResponse } from "next/server";

import { withDbConnection } from "@/lib/db/index";
import {
  getPopularFeed,
  mapPopularRowToCard,
  parsePopularParams,
} from "@/lib/popular/popular-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = parsePopularParams(request.nextUrl.searchParams);
  const result = await withDbConnection((conn) => getPopularFeed(conn, params));

  return NextResponse.json(
    {
      posts: result.rows.map(mapPopularRowToCard),
      page: params.page,
      period: params.period,
      site: params.site,
      hasMore: result.hasMore,
    },
    {
      headers: {
        "x-kimono-source": "db",
      },
    },
  );
}
