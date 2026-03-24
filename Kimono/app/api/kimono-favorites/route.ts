import { NextRequest, NextResponse } from "next/server";
import { deleteStoredKimonoSessionRecord } from "@/lib/remote-session";
import type { SupportedSite } from "@/lib/data-store";
import { getKimonoFavoritesPayload } from "@/lib/kimono-favorites-route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site");

  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Site invalide" }, { status: 400 });
  }

  const payload = await getKimonoFavoritesPayload({
    site: site as SupportedSite,
  });

  return NextResponse.json(payload);
}

export async function DELETE(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site") as SupportedSite | null;
  if (!site) {
    return NextResponse.json({ error: "Site manquant" }, { status: 400 });
  }

  const deleted = await deleteStoredKimonoSessionRecord(site);
  return NextResponse.json({ success: deleted });
}
