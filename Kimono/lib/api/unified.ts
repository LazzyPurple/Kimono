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
  cookie?: string
): Promise<UnifiedPost[]> {
  const posts = await siteApi(site).fetchCreatorPosts(service, creatorId, offset, cookie);
  return posts.map((p) => ({ ...p, site }));
}

/**
 * Récupère le profil d'un créateur depuis un site spécifique
 */
export async function fetchCreatorProfileBySite(
  site: Site,
  service: string,
  creatorId: string
): Promise<(Creator & { site: Site }) | null> {
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
  } else {
    console.error("[RECENT] kemono fetchRecentPosts failed:", results[0].reason?.message || results[0].reason);
  }
  if (results[1].status === "fulfilled") {
    posts.push(...results[1].value.map((p) => ({ ...p, site: "coomer" as Site })));
  } else {
    console.error("[RECENT] coomer fetchRecentPosts failed:", results[1].reason?.message || results[1].reason);
  }

  return deduplicatePosts(posts);
}

/**
 * Déduplique les posts par ID + service
 */
function deduplicatePosts(posts: UnifiedPost[]): UnifiedPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = `${post.site}-${post.service}-${post.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Déduplique les créateurs par ID + service + site
 */
function deduplicateCreators(creators: UnifiedCreator[]): UnifiedCreator[] {
  const seen = new Set<string>();
  return creators.filter((creator) => {
    const key = `${creator.site}-${creator.service}-${creator.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Construit l'URL d'une miniature depuis un post
 */
export function getPostThumbnail(post: UnifiedPost): string | undefined {
  // Utiliser les serveurs d'images CDN optimisés pour les thumbnails
  const imgCdn =
    post.site === "kemono" ? "https://img.kemono.cr/thumbnail" : "https://img.coomer.st/thumbnail";
  if (post.file?.path) return `${imgCdn}/data${post.file.path}`;
  const imgAttachment = post.attachments?.find((a) =>
    /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name || a.path)
  );
  if (imgAttachment) return `${imgCdn}/data${imgAttachment.path}`;
  return undefined;
}

/**
 * Détermine le type de média d'un post
 */
export function getPostType(post: UnifiedPost): "image" | "video" | "text" {
  const hasVideo = post.attachments?.some((a) =>
    /\.(mp4|webm|mov|avi)$/i.test(a.name)
  );
  if (hasVideo) return "video";
  const hasImage =
    post.file?.path ||
    post.attachments?.some((a) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name)
    );
  if (hasImage) return "image";
  return "text";
}
