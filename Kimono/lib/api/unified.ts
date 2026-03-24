import * as kemono from "./kemono.ts";
import * as coomer from "./coomer.ts";
import { deduplicatePosts, deduplicateCreators } from "./helpers.ts";
import type { Site, UnifiedPost, UnifiedCreator } from "./helpers.ts";

export type { Site, UnifiedPost, UnifiedCreator };

function siteApi(site: Site) {
  return site === "kemono" ? kemono : coomer;
}

/**
 * Récupère les posts d'un créateur depuis un site spécifique
 */
export async function fetchCreatorPostsBySite(
  site: Site,
  service: string,
  creatorId: string,
  offset: number = 0,
  cookie?: string,
  query?: string
): Promise<UnifiedPost[]> {
  const posts = await siteApi(site).fetchCreatorPosts(service, creatorId, offset, cookie, query);
  return posts.map((p) => ({ ...p, site }));
}

/**
 * Récupère le profil d'un créateur depuis un site spécifique
 */
export async function fetchCreatorProfileBySite(
  site: Site,
  service: string,
  creatorId: string
): Promise<(UnifiedCreator) | null> {
  const profile = await siteApi(site).fetchCreatorProfile(service, creatorId);
  if (!profile) return null;
  return { ...profile, site };
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
    for (const p of results[0].value) {
      posts.push({ ...p, site: "kemono" });
    }
  }
  if (results[1].status === "fulfilled") {
    for (const p of results[1].value) {
      posts.push({ ...p, site: "coomer" });
    }
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
    for (const c of results[0].value) {
      creators.push({ ...c, site: "kemono" });
    }
  }
  if (results[1].status === "fulfilled") {
    for (const c of results[1].value) {
      creators.push({ ...c, site: "coomer" });
    }
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
    for (const p of results[0].value) {
      posts.push({ ...p, site: "kemono" });
    }
  } else {
    console.error("[RECENT] kemono fetchRecentPosts failed:", results[0].reason?.message || results[0].reason);
  }
  if (results[1].status === "fulfilled") {
    for (const p of results[1].value) {
      posts.push({ ...p, site: "coomer" });
    }
  } else {
    console.error("[RECENT] coomer fetchRecentPosts failed:", results[1].reason?.message || results[1].reason);
  }

  return deduplicatePosts(posts);
}

export * from "./helpers.ts";


