import { NextRequest, NextResponse } from "next/server";
import { fetchCreatorProfileBySite } from "@/lib/api/unified";
import type { Site } from "@/lib/api/unified";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site") as Site;
  const service = searchParams.get("service") ?? "";
  const id = searchParams.get("id") ?? "";

  if (!site || !service || !id) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  try {
    const profile = await fetchCreatorProfileBySite(site, service, id);
    return NextResponse.json(profile);
  } catch (err) {
    console.error("creator-profile error:", err);
    return NextResponse.json(
      { error: "Impossible de récupérer le profil" },
      { status: 500 }
    );
  }
}
