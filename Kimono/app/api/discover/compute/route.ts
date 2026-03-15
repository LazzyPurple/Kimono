import { NextResponse } from "next/server";
import { getDataStore, type SupportedSite } from "@/lib/data-store";

export const dynamic = "force-dynamic";

const MAX_FAVORITES = 50;

interface Favorite {
  id: string;
  name: string;
  service: string;
  site: SupportedSite;
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
  site: SupportedSite;
  score: number;
}

async function fetchSiteFavorites(site: SupportedSite, cookie: string): Promise<Favorite[]> {
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
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((creator: any) => ({
      id: creator.id,
      name: creator.name,
      service: creator.service,
      site,
    }));
  } catch (error) {
    console.error(`[DISCOVER] Error fetching favorites for ${site}:`, error);
    return [];
  }
}

async function fetchRecommendations(
  site: SupportedSite,
  service: string,
  id: string
): Promise<RecommendedCreator[]> {
  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${baseUrl}/api/v1/${service}/user/${id}/recommended`, {
      headers: { Accept: "text/css" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }

  return chunks;
}

export async function POST() {
  try {
    const store = await getDataStore();
    const sessions = await store.getKimonoSessions();

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "Aucune session trouvee. Veuillez vous connecter." },
        { status: 400 }
      );
    }

    let allFavorites = (await Promise.all(
      sessions.map((session) => fetchSiteFavorites(session.site, session.cookie))
    )).flat();

    if (allFavorites.length === 0) {
      return NextResponse.json({ error: "Aucun favori trouve." }, { status: 400 });
    }

    const totalFavorites = allFavorites.length;
    const wasTruncated = totalFavorites > MAX_FAVORITES;

    if (wasTruncated) {
      allFavorites = allFavorites.slice(0, MAX_FAVORITES);
    }

    const favoriteKeys = new Set(
      allFavorites.map((favorite) => `${favorite.site}-${favorite.service}-${favorite.id}`)
    );

    const batches = chunkArray(allFavorites, 15);
    const scoreMap = new Map<string, ScoredCreator>();

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      console.log(`[DISCOVER] Processing batch ${index + 1}/${batches.length}...`);

      await Promise.all(
        batch.map(async (favorite) => {
          const recommendations = await fetchRecommendations(
            favorite.site,
            favorite.service,
            favorite.id
          );

          for (const recommendation of recommendations) {
            const key = `${favorite.site}-${recommendation.service}-${recommendation.id}`;
            const existing = scoreMap.get(key);

            if (existing) {
              existing.score += 1;
            } else {
              scoreMap.set(key, {
                ...recommendation,
                site: favorite.site,
                score: 1,
              });
            }
          }
        })
      );

      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const blocks = await store.getDiscoveryBlocks();
    const blockedKeys = new Set(
      blocks.map((block) => `${block.site}-${block.service}-${block.creatorId}`)
    );

    const finalRecommendations = Array.from(scoreMap.values())
      .filter((recommendation) => {
        const key = `${recommendation.site}-${recommendation.service}-${recommendation.id}`;
        return !favoriteKeys.has(key) && !blockedKeys.has(key);
      })
      .sort((left, right) => right.score - left.score);

    const now = new Date();
    await store.setDiscoveryCache("global", finalRecommendations, now);

    return NextResponse.json({
      total: finalRecommendations.length,
      updatedAt: now.toISOString(),
      ...(wasTruncated && {
        warning: `Seuls ${MAX_FAVORITES} favoris sur ${totalFavorites} ont ete traites pour respecter les limites du serveur.`,
      }),
    });
  } catch (error) {
    console.error("[DISCOVER] Error in compute:", error);
    return NextResponse.json({ error: "Erreur lors du calcul" }, { status: 500 });
  }
}
