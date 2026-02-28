import * as kemono from "./kemono";
import * as coomer from "./coomer";
import type { Creator, Post } from "./kemono";

// Types unifiés avec indicateur de site source
export type Site = "kemono" | "coomer";

export interface UnifiedPost extends Post {
  site: Site;
}

export interface UnifiedCreator extends Creator {
  site: Site;
}

/**
 * Récupère les posts d'un créateur depuis les deux sites en parallèle
 */
export async function fetchCreatorPosts(
  service: string,
  creatorId: string,
  offset: number = 0
): Promise<UnifiedPost[]> {
  const results = await Promise.allSettled([
    kemono.fetchCreatorPosts(service, creatorId, offset),
    coomer.fetchCreatorPosts(service, creatorId, offset),
  ]);

  const posts: UnifiedPost[] = [];

  if (results[0].status === "fulfilled") {
    posts.push(...results[0].value.map((p) => ({ ...p, site: "kemono" as Site })));
  }
  if (results[1].status === "fulfilled") {
    posts.push(...results[1].value.map((p) => ({ ...p, site: "coomer" as Site })));
  }

  return deduplicatePosts(posts);
}

/**
 * Recherche des créateurs sur les deux sites en parallèle
 */
export async function searchCreators(query: string): Promise<UnifiedCreator[]> {
  const results = await Promise.allSettled([
    kemono.searchCreators(query),
    coomer.searchCreators(query),
  ]);

  const creators: UnifiedCreator[] = [];

  if (results[0].status === "fulfilled") {
    creators.push(
      ...results[0].value.map((c) => ({ ...c, site: "kemono" as Site }))
    );
  }
  if (results[1].status === "fulfilled") {
    creators.push(
      ...results[1].value.map((c) => ({ ...c, site: "coomer" as Site }))
    );
  }

  return deduplicateCreators(creators);
}

/**
 * Récupère les posts récents depuis les deux sites en parallèle
 */
export async function fetchRecentPosts(
  offset: number = 0
): Promise<UnifiedPost[]> {
  const results = await Promise.allSettled([
    kemono.fetchRecentPosts(offset),
    coomer.fetchRecentPosts(offset),
  ]);

  const posts: UnifiedPost[] = [];

  if (results[0].status === "fulfilled") {
    posts.push(...results[0].value.map((p) => ({ ...p, site: "kemono" as Site })));
  }
  if (results[1].status === "fulfilled") {
    posts.push(...results[1].value.map((p) => ({ ...p, site: "coomer" as Site })));
  }

  return deduplicatePosts(posts);
}

/**
 * Déduplique les posts par ID + service
 */
function deduplicatePosts(posts: UnifiedPost[]): UnifiedPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = `${post.service}-${post.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Déduplique les créateurs par ID + service
 */
function deduplicateCreators(creators: UnifiedCreator[]): UnifiedCreator[] {
  const seen = new Set<string>();
  return creators.filter((creator) => {
    const key = `${creator.service}-${creator.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
