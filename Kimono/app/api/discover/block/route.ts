import { NextResponse, NextRequest } from "next/server";
import { execute } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { site, service, creatorId } = await request.json();

    if (!site || !service || !creatorId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const now = new Date();
    await execute(
      "INSERT INTO DiscoveryBlock (id, site, service, creatorId, blockedAt) VALUES (?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE blockedAt = ?",
      [crypto.randomUUID(), site, service, creatorId, now, now]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DISCOVER BLOCK] Error blocking creator:", error);
    return NextResponse.json({ error: "Erreur lors du blocage" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { site, service, creatorId } = await request.json();

    if (!site || !service || !creatorId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    await execute(
      "DELETE FROM DiscoveryBlock WHERE site = ? AND service = ? AND creatorId = ?",
      [site, service, creatorId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DISCOVER BLOCK] Error unblocking creator:", error);
    return NextResponse.json({ error: "Erreur lors de l'annulation du blocage" }, { status: 500 });
  }
}
