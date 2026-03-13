import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { logAppError } from "@/lib/app-logger";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site");
  const service = searchParams.get("service") ?? "";
  const user = searchParams.get("user") ?? "";
  const id = searchParams.get("id") ?? "";

  if (!site || (site !== "kemono" && site !== "coomer") || !service || !user || !id) {
    return NextResponse.json({ error: "Parametres manquants ou invalides" }, { status: 400 });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);
    const result = await hybridContent.getPostDetail({
      site,
      service,
      creatorId: user,
      postId: id,
      cookie: cookie ?? undefined,
    });

    return NextResponse.json(result.post, {
      headers: {
        "x-kimono-source": result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "post route error", error, {
      details: {
        route: "/api/post",
        site,
        service,
        creatorId: user,
        postId: id,
      },
    });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

