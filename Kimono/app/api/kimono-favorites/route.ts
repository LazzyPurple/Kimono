import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import * as kemono from "@/lib/api/kemono";
import * as coomer from "@/lib/api/coomer";
import type { Site } from "@/lib/api/unified";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site") as Site | null;

  if (!site || (site !== "kemono" && site !== "coomer")) {
    return NextResponse.json({ error: "Site invalide" }, { status: 400 });
  }

  const sessions = await query<any>(
    "SELECT * FROM KimonoSession WHERE site = ? ORDER BY savedAt DESC LIMIT 1",
    [site]
  );
  const session = sessions[0];

  if (!session) {
    return NextResponse.json({ loggedIn: false, favorites: [] });
  }

  try {
    const api = site === "kemono" ? kemono : coomer;
    const favorites = await api.fetchFavorites(session.cookie);
    return NextResponse.json({ loggedIn: true, favorites, username: session.username });
  } catch (err) {
    console.error("kimono-favorites error:", err);
    // Session probablement expirÃ©e
    return NextResponse.json({
      loggedIn: false,
      favorites: [],
      expired: true,
    });
  }
}

export async function DELETE(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site") as Site | null;
  if (!site) {
    return NextResponse.json({ error: "Site manquant" }, { status: 400 });
  }
  await execute("DELETE FROM KimonoSession WHERE site = ?", [site]);
  return NextResponse.json({ success: true });
}

