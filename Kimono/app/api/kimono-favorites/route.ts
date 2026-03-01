import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as kemono from "@/lib/api/kemono";
import * as coomer from "@/lib/api/coomer";
import type { Site } from "@/lib/api/unified";

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site") as Site | null;

  if (!site || (site !== "kemono" && site !== "coomer")) {
    return NextResponse.json({ error: "Site invalide" }, { status: 400 });
  }

  const session = await prisma.kimonoSession.findFirst({
    where: { site },
    orderBy: { savedAt: "desc" },
  });

  if (!session) {
    return NextResponse.json({ loggedIn: false, favorites: [] });
  }

  try {
    const api = site === "kemono" ? kemono : coomer;
    const favorites = await api.fetchFavorites(session.cookie);
    return NextResponse.json({ loggedIn: true, favorites, username: session.username });
  } catch (err) {
    console.error("kimono-favorites error:", err);
    // Session probablement expirée
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
  await prisma.kimonoSession.deleteMany({ where: { site } });
  return NextResponse.json({ success: true });
}
