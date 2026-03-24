import { NextRequest, NextResponse } from "next/server";
import { getRecentPostsPayload } from "@/lib/recent-posts-route";

export async function GET(request: NextRequest) {
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  try {
    const posts = await getRecentPostsPayload({ offset });
    return NextResponse.json(posts);
  } catch (err) {
    console.error("recent-posts error:", err);
    return NextResponse.json(
      { error: "Impossible de récupérer les posts récents" },
      { status: 500 }
    );
  }
}


