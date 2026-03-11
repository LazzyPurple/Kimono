import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const caches = await query<any>("SELECT * FROM DiscoveryCache WHERE id = 'global'");
    const cache = caches[0];

    if (!cache) {
      return NextResponse.json({ creators: [], updatedAt: null, total: 0 });
    }

    const allRecommendations = JSON.parse(cache.data);

    // Filter dynamically in case blocks were added since the last compute
    const blocks = await query<any>("SELECT * FROM DiscoveryBlock");
    const blockedKeys = new Set(blocks.map((b: any) => `${b.site}-${b.service}-${b.creatorId}`));

    const filtered = allRecommendations.filter((rec: any) => {
      const key = `${rec.site}-${rec.service}-${rec.id}`;
      return !blockedKeys.has(key);
    });

    return NextResponse.json({
      creators: filtered,
      updatedAt: typeof cache.updatedAt === "string" ? new Date(cache.updatedAt).toISOString() : cache.updatedAt.toISOString(),
      total: filtered.length,
    });
  } catch (error) {
    console.error("[DISCOVER] Error fetching results:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération" }, { status: 500 });
  }
}
