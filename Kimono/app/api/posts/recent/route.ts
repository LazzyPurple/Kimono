import { NextRequest, NextResponse } from "next/server";

import { getRecentPostsPayload } from "@/lib/recent-posts-route";
import { db } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? "0") || 0);

  try {
    const payload = await getRecentPostsPayload({ offset });
    return NextResponse.json(payload, {
      headers: {
        "x-kimono-source": Array.isArray(payload) ? "upstream" : (payload as { source?: string }).source ?? "upstream",
      },
    });
  } catch (error) {
    await logAppError("api", "posts/recent route error", error, {
      details: { route: "/api/posts/recent", offset, dbLoaded: Boolean(db) },
    });
    return NextResponse.json({ error: "Unable to load recent posts" }, { status: 503, headers: { "x-kimono-source": "stale" } });
  }
}
