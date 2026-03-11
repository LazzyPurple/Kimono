import { NextRequest, NextResponse } from "next/server";
import { fetchCreatorPostsBySite } from "@/lib/api/unified";
import type { Site } from "@/lib/api/unified";
import { query as dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site") as Site;
  const service = searchParams.get("service") ?? "";
  const id = searchParams.get("id") ?? "";
  const offset = Number(searchParams.get("offset") ?? 0);
  const query = searchParams.get("q") || undefined;

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  try {
    // Récupérer le cookie de session si disponible (pour le contenu restreint)
    const sessions = await dbQuery<any>(
      "SELECT * FROM KimonoSession WHERE site = ? ORDER BY savedAt DESC LIMIT 1",
      [site]
    );
    const session = sessions[0];

    const posts = await fetchCreatorPostsBySite(site, service, id, offset, session?.cookie, query);
    // Guard: s'assurer qu'on retourne toujours un tableau
    const safePosts = Array.isArray(posts) ? posts : [];
    if (!Array.isArray(posts)) {
      console.error("creator-posts: unexpected response (not an array):", posts);
    }
    return NextResponse.json(safePosts);
  } catch (err) {
    console.error("creator-posts error:", err);
    return NextResponse.json([], { status: 200 }); // retourner [] plutôt qu'une erreur JSON
  }
}
