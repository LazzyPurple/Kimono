import { NextResponse, NextRequest } from "next/server";
import { getDataStore, type SupportedSite } from "@/lib/db/index";

export const dynamic = "force-dynamic";

function isSupportedSite(site: string): site is SupportedSite {
  return site === "kemono" || site === "coomer";
}

export async function POST(request: NextRequest) {
  try {
    const { site, service, creatorId } = await request.json();

    if (!site || !service || !creatorId || !isSupportedSite(site)) {
      return NextResponse.json({ error: "Parametres manquants" }, { status: 400 });
    }

    const store = await getDataStore();
    await store.blockDiscoveryCreator({ site, service, creatorId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DISCOVER BLOCK] Error blocking creator:", error);
    return NextResponse.json({ error: "Erreur lors du blocage" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { site, service, creatorId } = await request.json();

    if (!site || !service || !creatorId || !isSupportedSite(site)) {
      return NextResponse.json({ error: "Parametres manquants" }, { status: 400 });
    }

    const store = await getDataStore();
    await store.unblockDiscoveryCreator({ site, service, creatorId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DISCOVER BLOCK] Error unblocking creator:", error);
    return NextResponse.json({ error: "Erreur lors de l'annulation du blocage" }, { status: 500 });
  }
}

