import { NextRequest, NextResponse } from "next/server";
import { fetchCreatorPostsBySite } from "@/lib/api/unified";
import type { Site } from "@/lib/api/unified";
import { prisma } from "@/lib/prisma";

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
    const session = await prisma.kimonoSession.findFirst({
      where: { site },
      orderBy: { savedAt: "desc" },
    });

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
