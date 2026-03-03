import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedPosts, setCachedPosts } from "@/lib/api/posts-cache";
import * as kemono from "@/lib/api/kemono";
import * as coomer from "@/lib/api/coomer";
import type { Site } from "@/lib/api/unified";
import type { Post } from "@/lib/api/kemono";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 5;     // Pages en parallèle
const PAGE_SIZE = 50;     // Posts par page (API Kemono/Coomer)
const MAX_PAGES = 200;    // Sécurité : max 10000 posts

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site") as Site;
  const service = searchParams.get("service") ?? "";
  const id = searchParams.get("id") ?? "";

  if (!site || (site !== "kemono" && site !== "coomer") || !service || !id) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // 1. Vérifier le cache
  const cached = await getCachedPosts(site, service, id);
  if (cached) {
    console.log(`[ALL-POSTS] Cache hit for ${site}/${service}/${id}: ${cached.length} posts`);
    return NextResponse.json(cached);
  }

  // 2. Récupérer le cookie de session (pour contenu restreint)
  const session = await prisma.kimonoSession.findFirst({
    where: { site },
    orderBy: { savedAt: "desc" },
  });
  const cookie = session?.cookie;

  const api = site === "kemono" ? kemono : coomer;

  // 3. Fetch parallèle par batch
  const allPosts: Post[] = [];
  let offset = 0;
  let done = false;
  let pagesFetched = 0;

  console.log(`[ALL-POSTS] Starting parallel fetch for ${site}/${service}/${id}`);

  while (!done && pagesFetched < MAX_PAGES) {
    // Créer un batch de BATCH_SIZE requêtes
    const batchPromises: Promise<Post[]>[] = [];
    for (let i = 0; i < BATCH_SIZE && pagesFetched + i < MAX_PAGES; i++) {
      const currentOffset = offset + i * PAGE_SIZE;
      batchPromises.push(
        api.fetchCreatorPosts(service, id, currentOffset, cookie).catch((err) => {
          console.error(`[ALL-POSTS] Error at offset ${currentOffset}:`, err?.message);
          return [] as Post[];
        })
      );
    }

    const batchResults = await Promise.all(batchPromises);

    for (const posts of batchResults) {
      if (!Array.isArray(posts) || posts.length === 0) {
        done = true;
        break;
      }
      allPosts.push(...posts);
      pagesFetched++;
      if (posts.length < PAGE_SIZE) {
        done = true;
        break;
      }
    }

    offset += BATCH_SIZE * PAGE_SIZE;
  }

  console.log(`[ALL-POSTS] Fetched ${allPosts.length} posts in ${pagesFetched} pages for ${site}/${service}/${id}`);

  // 4. Mettre en cache
  if (allPosts.length > 0) {
    await setCachedPosts(site, service, id, allPosts);
  }

  return NextResponse.json(allPosts);
}
