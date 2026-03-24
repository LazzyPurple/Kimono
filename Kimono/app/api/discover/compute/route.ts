import { NextResponse } from "next/server";
import { getDataStore, type SupportedSite } from "@/lib/data-store";
import { createRateLimitError, getGlobalUpstreamRateGuard } from "@/lib/api/upstream-rate-guard";

export const dynamic = "force-dynamic";

const MAX_FAVORITES = 50;
const DISCOVER_BATCH_SIZE = 15;
const DISCOVER_BATCH_DELAY_MS = 500;

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

async function fetchRecommendations(
  site: SupportedSite,
  service: string,
  id: string
): Promise<RecommendedCreator[]> {
  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const url = `${baseUrl}/api/v1/${service}/user/${id}/recommended`;
  const guard = getGlobalUpstreamRateGuard();
  const decision = guard.canRequest(site, "discover");

  if (!decision.allowed) {
    throw createRateLimitError(site, decision.retryAfterMs, "discover");
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      headers: { Accept: "text/css" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) {
      const retryAfterMs = guard.registerRateLimit(site, {
        status: res.status,
        headers: {
          "retry-after": res.headers.get("retry-after"),
        },
      }, "discover");
      throw createRateLimitError(site, retryAfterMs, "discover");
    }

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "UPSTREAM_COOLDOWN") {
      throw error;
    }
    return [];
  }
}

async function readFavoriteSnapshot(site: SupportedSite): Promise<{ items: Favorite[]; updatedAt: string | null }> {
  const store = await getDataStore();

  try {
    const snapshot = await store.getFavoriteSnapshot({ kind: "creator", site });
    if (!snapshot?.data) {
      return { items: [], updatedAt: null };
    }

    const parsed = JSON.parse(snapshot.data);
    if (!Array.isArray(parsed)) {
      return { items: [], updatedAt: snapshot.updatedAt?.toISOString?.() ?? null };
    }

    return {
      items: parsed.map((creator: any) => ({
        id: String(creator.id ?? ""),
        name: String(creator.name ?? ""),
        service: String(creator.service ?? ""),
        site,
      })).filter((creator) => Boolean(creator.id) && Boolean(creator.service)),
      updatedAt: snapshot.updatedAt?.toISOString?.() ?? null,
    };
  } catch {
    return { items: [], updatedAt: null };
  } finally {
    await store.disconnect();
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
  let store: Awaited<ReturnType<typeof getDataStore>> | null = null;

  try {
    store = await getDataStore();
    const favoriteSnapshots = await Promise.all((["kemono", "coomer"] as SupportedSite[]).map((site) => readFavoriteSnapshot(site)));
    let allFavorites = favoriteSnapshots.flatMap((snapshot) => snapshot.items);
    const snapshotUpdatedAt = favoriteSnapshots
      .map((snapshot) => snapshot.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;

    if (allFavorites.length === 0) {
      return NextResponse.json(
        {
          error: "Aucun snapshot de favoris disponible. Lance d'abord une synchronisation des favoris.",
          source: "snapshot-only",
          snapshotUpdatedAt,
        },
        { status: 409 }
      );
    }

    const totalFavorites = allFavorites.length;
    const wasTruncated = totalFavorites > MAX_FAVORITES;

    if (wasTruncated) {
      allFavorites = allFavorites.slice(0, MAX_FAVORITES);
    }

    const favoriteKeys = new Set(
      allFavorites.map((favorite) => `${favorite.site}-${favorite.service}-${favorite.id}`)
    );

    const batches = chunkArray(allFavorites, DISCOVER_BATCH_SIZE);
    const scoreMap = new Map<string, ScoredCreator>();
    const rateLimitedSites = new Set<SupportedSite>();

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];

      await Promise.all(
        batch.map(async (favorite) => {
          try {
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
          } catch (error) {
            if ((error as { code?: string; site?: SupportedSite } | null)?.code === "UPSTREAM_COOLDOWN") {
              rateLimitedSites.add((error as { site: SupportedSite }).site);
            }
          }
        })
      );

      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DISCOVER_BATCH_DELAY_MS));
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
      source: "snapshot-only",
      snapshotUpdatedAt,
      rateLimitedSites: Array.from(rateLimitedSites),
      ...(wasTruncated && {
        warning: `Seuls ${MAX_FAVORITES} favoris sur ${totalFavorites} ont ete traites pour respecter les limites du serveur.`,
      }),
    });
  } catch (error) {
    console.error("[DISCOVER] Error in compute:", error);
    return NextResponse.json({ error: "Erreur lors du calcul" }, { status: 500 });
  } finally {
    await store?.disconnect();
  }
}
