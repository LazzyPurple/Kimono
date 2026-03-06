import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { site, service, creatorId } = await request.json();

    if (!site || !service || !creatorId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    await prisma.discoveryBlock.upsert({
      where: { 
        site_service_creatorId: { site, service, creatorId } 
      },
      update: {
        blockedAt: new Date(),
      },
      create: {
        site,
        service,
        creatorId,
      },
    });

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

    await prisma.discoveryBlock.deleteMany({
      where: { site, service, creatorId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DISCOVER BLOCK] Error unblocking creator:", error);
    return NextResponse.json({ error: "Erreur lors de l'annulation du blocage" }, { status: 500 });
  }
}
