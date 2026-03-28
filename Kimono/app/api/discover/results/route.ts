import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await getDataStore();
    const cache = await store.getDiscoveryCache("global");

    if (!cache) {
      return NextResponse.json({ creators: [], updatedAt: null, total: 0 });
    }

    const allRecommendations = JSON.parse(cache.data);
    const blocks = await store.getDiscoveryBlocks();
    const blockedKeys = new Set(
      blocks.map((block) => `${block.site}-${block.service}-${block.creatorId}`)
    );

    const filtered = allRecommendations.filter((recommendation: any) => {
      const key = `${recommendation.site}-${recommendation.service}-${recommendation.id}`;
      return !blockedKeys.has(key);
    });

    return NextResponse.json({
      creators: filtered,
      updatedAt: cache.updatedAt.toISOString(),
      total: filtered.length,
    });
  } catch (error) {
    console.error("[DISCOVER] Error fetching results:", error);
    return NextResponse.json({ error: "Erreur lors de la recuperation" }, { status: 500 });
  }
}

