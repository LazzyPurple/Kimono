import { NextRequest, NextResponse } from "next/server";
import * as kemono from "@/lib/api/kemono";
import * as coomer from "@/lib/api/coomer";
import { logAppError } from "@/lib/app-logger";
import {
  deleteStoredKimonoSessionRecord,
  loadStoredKimonoSessionRecord,
} from "@/lib/remote-session";
import type { Site } from "@/lib/api/unified";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site") as Site | null;

  if (!site || (site !== "kemono" && site !== "coomer")) {
    return NextResponse.json({ error: "Site invalide" }, { status: 400 });
  }

  const session = await loadStoredKimonoSessionRecord(site);

  if (!session) {
    return NextResponse.json({ loggedIn: false, favorites: [] });
  }

  try {
    const api = site === "kemono" ? kemono : coomer;
    const favorites = await api.fetchFavorites(session.cookie);
    return NextResponse.json({
      loggedIn: true,
      favorites,
      username: session.username,
    });
  } catch (error) {
    await logAppError("api", "kimono-favorites error", error, {
      details: {
        route: "/api/kimono-favorites",
        method: "GET",
        site,
      },
    });
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

  const deleted = await deleteStoredKimonoSessionRecord(site);
  return NextResponse.json({ success: deleted });
}
