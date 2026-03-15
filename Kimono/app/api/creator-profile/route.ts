import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { logAppError } from "@/lib/app-logger";
import type { Site } from "@/lib/api/unified";

const hybridContent = createHybridContentService();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site") as Site;
  const service = searchParams.get("service") ?? "";
  const id = searchParams.get("id") ?? "";

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Parametres manquants" }, { status: 400 });
  }

  try {
    const result = await hybridContent.getCreatorProfile({
      site,
      service,
      creatorId: id,
    });

    return NextResponse.json(result.profile, {
      headers: {
        "x-kimono-source": result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "creator-profile error", error, {
      details: {
        route: "/api/creator-profile",
        site,
        service,
        creatorId: id,
      },
    });
    return NextResponse.json(
      { error: "Impossible de recuperer le profil" },
      { status: 500 }
    );
  }
}
