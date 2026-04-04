import { NextRequest, NextResponse } from "next/server";

import { getCreatorPageData, parseCreatorPageParams } from "@/lib/creators/creator-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    site: string;
    id: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { site, id } = await context.params;
  const parsed = parseCreatorPageParams(request.nextUrl.searchParams);
  const data = await getCreatorPageData({
    site,
    creatorId: id,
    page: parsed.page,
  });

  if (!data) {
    return NextResponse.json(
      { error: "Creator not found" },
      { status: 404, headers: { "x-kimono-source": "db" } },
    );
  }

  return NextResponse.json(
    {
      creator: data.creator,
      page: data.page,
      hasMore: data.hasMore,
      source: data.source,
    },
    {
      headers: {
        "x-kimono-source": data.source,
      },
    },
  );
}
