import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max (if deployed on Vercel)

interface Favorite {
  id: string;
  name: string;
  service: string;
  site: string; // "kemono" | "coomer"
}

interface RecommendedCreator {
  id: string;
  service: string;
  name: string;
  indexed: string;
  updated: string;
  public_id: string | null;
  relation_id: number | null;
}

interface ScoredCreator extends RecommendedCreator {
  site: "kemono" | "coomer";
  score: number;
}

async function fetchSiteFavorites(site: "kemono" | "coomer", cookie: string): Promise<Favorite[]> {
  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${baseUrl}/api/v1/account/favorites?type=artist`, {
      headers: {
        Accept: "text/css",
        Cookie: cookie,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[DISCOVER] Failed to fetch favorites for ${site}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((c: any) => ({
      id: c.id,
      name: c.name,
      service: c.service,
      site,
    }));
  } catch (error) {
    console.error(`[DISCOVER] Error fetching favorites for ${site}:`, error);
    return [];
  }
}

async function fetchRecommendations(site: "kemono" | "coomer", service: string, id: string): Promise<RecommendedCreator[]> {
  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${baseUrl}/api/v1/${service}/user/${id}/recommended`, {
      headers: { Accept: "text/css" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

// Helper to chunk arrays
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function POST() {
  try {
    console.log("[DISCOVER] Prisma models:", Object.keys(prisma).filter(k => !k.startsWith("_")));
    const sessions = await prisma.kimonoSession.findMany();
    if (sessions.length === 0) {
      return NextResponse.json({ error: "Aucune session trouvée. Veuillez vous connecter." }, { status: 400 });
    }

    let allFavorites: Favorite[] = [];

    // 1. Fetch all favorites from Kemono and Coomer
    const favPromises = sessions.map((s) => fetchSiteFavorites(s.site as "kemono" | "coomer", s.cookie));
    const favResults = await Promise.all(favPromises);
    allFavorites = favResults.flat();

    if (allFavorites.length === 0) {
      return NextResponse.json({ error: "Aucun favori trouvé." }, { status: 400 });
    }

    const favoriteKeys = new Set(allFavorites.map((f) => `${f.site}-${f.service}-${f.id}`));

    // 2. Compute recommendations by batching requests (max 15 concurrent)
    const BATCH_SIZE = 15;
    const batches = chunkArray(allFavorites, BATCH_SIZE);
    
    console.log(`[DISCOVER] Computing recommendations for ${allFavorites.length} favorites in ${batches.length} batches.`);

    const scoreMap = new Map<string, ScoredCreator>();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[DISCOVER] Processing batch ${i + 1}/${batches.length}...`);
      
      const promises = batch.map(async (fav) => {
        const recs = await fetchRecommendations(fav.site as "kemono" | "coomer", fav.service, fav.id);
        
        for (const rec of recs) {
          const key = `${fav.site}-${rec.service}-${rec.id}`;
          
          if (scoreMap.has(key)) {
            scoreMap.get(key)!.score += 1;
          } else {
            scoreMap.set(key, { ...rec, site: fav.site as "kemono" | "coomer", score: 1 });
          }
        }
      });

      await Promise.all(promises);
      
      // Small pause between batches to be nice to the API
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 3. Filter out existing favorites and blocked creators
    const blocks = await (prisma as any).discoveryBlock.findMany();
    const blockedKeys = new Set(blocks.map((b: any) => `${b.site}-${b.service}-${b.creatorId}`));

    const finalRecommendations = Array.from(scoreMap.values())
      .filter((rec) => {
        const key = `${rec.site}-${rec.service}-${rec.id}`;
        return !favoriteKeys.has(key) && !blockedKeys.has(key);
      })
      .sort((a, b) => b.score - a.score);

    // 4. Save to Cache
    // We use a fixed ID 'global' to only store one recent cache
    await (prisma as any).discoveryCache.upsert({
      where: { id: "global" },
      update: {
        data: JSON.stringify(finalRecommendations),
        updatedAt: new Date(),
      },
      create: {
        id: "global",
        data: JSON.stringify(finalRecommendations),
      },
    });

    return NextResponse.json({
      total: finalRecommendations.length,
      updatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[DISCOVER] Error in compute:", error);
    return NextResponse.json({ error: "Erreur lors du calcul" }, { status: 500 });
  }
}
