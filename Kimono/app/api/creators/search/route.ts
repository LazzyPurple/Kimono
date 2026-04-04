import { NextRequest, NextResponse } from "next/server";

import { withDbConnection, db } from "@/lib/db/index";
import {
  mapCreatorRowToSearchCard,
  parseCreatorSearchParams,
  toSearchCreatorsOpts,
} from "@/lib/search/creator-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = parseCreatorSearchParams(request.nextUrl.searchParams);

  const result = await withDbConnection((conn) =>
    db.searchCreators(conn, toSearchCreatorsOpts(params)),
  );

  return NextResponse.json(
    {
      creators: result.rows.map(mapCreatorRowToSearchCard),
      page: params.page,
      perPage: toSearchCreatorsOpts(params).perPage,
      total: result.total,
      snapshotFresh: result.snapshotFresh,
    },
    {
      headers: {
        "x-kimono-source": "db",
      },
    },
  );
}
