import { NextRequest, NextResponse } from "next/server";
import { fetchCreatorPostsBySite } from "@/lib/api/unified";
import type { Site } from "@/lib/api/unified";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site") as Site;
  const service = searchParams.get("service") ?? "";
  const id = searchParams.get("id") ?? "";
  const offset = Number(searchParams.get("offset") ?? 0);

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  try {
    const posts = await fetchCreatorPostsBySite(site, service, id, offset);
    return NextResponse.json(posts);
  } catch (err) {
    console.error("creator-posts error:", err);
    return NextResponse.json(
      { error: "Impossible de récupérer les posts" },
      { status: 500 }
    );
  }
}
