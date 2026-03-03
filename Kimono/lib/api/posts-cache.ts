import prisma from "@/lib/prisma";
import type { Post } from "./kemono";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

// Cache mémoire : Map<cacheKey, { posts, timestamp }>
const memoryCache = new Map<string, { posts: Post[]; timestamp: number }>();

function makeCacheKey(site: string, service: string, creatorId: string): string {
  return `${site}-${service}-${creatorId}`;
}

export async function getCachedPosts(
  site: string,
  service: string,
  creatorId: string
): Promise<Post[] | null> {
  const key = makeCacheKey(site, service, creatorId);
  const now = Date.now();

  // 1. Check mémoire
  const mem = memoryCache.get(key);
  if (mem && now - mem.timestamp < CACHE_TTL_MS) {
    return mem.posts;
  }

  // 2. Fallback Prisma
  try {
    const row = await prisma.postsCache.findUnique({ where: { id: key } });
    if (row && now - row.updatedAt.getTime() < CACHE_TTL_MS) {
      const posts = JSON.parse(row.data) as Post[];
      // Remplir le cache mémoire
      memoryCache.set(key, { posts, timestamp: row.updatedAt.getTime() });
      return posts;
    }
  } catch (err) {
    console.error("[POSTS-CACHE] Prisma read error:", err);
  }

  return null;
}

export async function setCachedPosts(
  site: string,
  service: string,
  creatorId: string,
  posts: Post[]
): Promise<void> {
  const key = makeCacheKey(site, service, creatorId);
  const now = Date.now();

  // Mémoire
  memoryCache.set(key, { posts, timestamp: now });

  // Prisma
  try {
    const jsonData = JSON.stringify(posts);
    await prisma.postsCache.upsert({
      where: { id: key },
      update: { data: jsonData, postCount: posts.length, updatedAt: new Date() },
      create: { id: key, data: jsonData, postCount: posts.length },
    });
  } catch (err) {
    console.error("[POSTS-CACHE] Prisma write error:", err);
    // Le cache mémoire reste valide même si Prisma échoue
  }
}
