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

const IMAGE_EXTENSIONS = [".gif", ".jpeg", ".jpg", ".jpe", ".png", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"];
// Services qui ont souvent le fichier principal vide et les contenus dans les attachments
const FALLBACK_SERVICES = ["fansly", "candfans", "boosty", "gumroad"];

function isVideo(p: string): boolean {
  const lower = p.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function isImage(p: string): boolean {
  const lower = p.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Remplace l'extension d'un path par .jpg
 * Le CDN Kemono/Coomer génère automatiquement un .jpg pour chaque fichier uploadé,
 * y compris les vidéos. C'est le trick découvert dans KemonoScrapper.
 */
function toJpgPath(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return filePath + ".jpg";
  return filePath.substring(0, lastDot) + ".jpg";
}

/* ── Proxy helpers ──────────────────────────────────────────── */

/**
 * Enveloppe une URL externe dans le proxy thumbnail local.
 * Utilisable côté client : génère /api/thumbnail?url=<encoded>
 */
export function proxyUrl(externalUrl: string): string {
  return `/api/thumbnail?url=${encodeURIComponent(externalUrl)}`;
}

/**
 * Construit une URL CDN (avatar, banner…) et la proxifie automatiquement.
 * @param site  kemono | coomer
 * @param path  e.g. "/icons/patreon/12345" ou "/banners/patreon/12345"
 */
export function proxyCdnUrl(site: Site, path: string): string {
  const cdn = site === "kemono" ? "https://img.kemono.cr" : "https://img.coomer.st";
  return proxyUrl(`${cdn}${path}`);
}

/**
 * Construit une URL pour le proxy video-thumbnail (extraction ffmpeg).
 */
export function getVideoThumbnailUrl(site: Site, filePath: string): string | undefined {
  if (site === "coomer") return undefined;
  const base = "https://kemono.cr";
  const fullUrl = `${base}/data${encodeURI(filePath)}`;
  return `/api/proxy/video-thumbnail?url=${encodeURIComponent(fullUrl)}`;
}

/**
 * Construit une URL de thumbnail pour un chemin de fichier (proxifiée).
 */
export function getThumbnailUrl(site: Site, path: string): string {
  const base = site === "kemono" ? "https://img.kemono.cr" : "https://img.coomer.st";
  return proxyUrl(`${base}/thumbnail/data${encodeURI(path)}`);
}

/**
 * Construit une URL full-res pour un chemin de fichier (proxifiée).
 */
export function getFullImageUrl(site: Site, path: string): string {
  const base = site === "kemono" ? "https://kemono.su" : "https://coomer.su";
  return proxyUrl(`${base}/data${encodeURI(path)}`);
}

/**
 * Construit l'URL d'une miniature depuis un post.
 *
 * Logique combinée de Kemono officiel + KemonoScrapper :
 * 1. Fichier principal est une image → thumbnail CDN direct
 * 2. Fichier principal est une vidéo → extension → .jpg (trick CDN)
 * 3. Fallback attachments pour fansly/candfans/boosty/gumroad
 * 4. Attachments vidéo → extension → .jpg
 */
export function getPostThumbnail(post: UnifiedPost): string | undefined {
  const thumbBase =
    post.site === "kemono" ? "https://img.kemono.cr" : "https://img.coomer.st";

  const filePath = post.file?.path;

  // Helper interne : construit l'URL CDN et la proxifie
  const proxiedThumb = (path: string) =>
    proxyUrl(`${thumbBase}/thumbnail/data${encodeURI(path)}`);

  // 1. Fichier principal est une image → thumbnail direct
  if (filePath && isImage(filePath) && !filePath.startsWith("http")) {
    return proxiedThumb(filePath);
  }

  // 2. Fichier principal est une vidéo → remplacer extension par .jpg
  //    Le CDN génère un .jpg pour chaque fichier uploadé (trick KemonoScrapper)
  if (filePath && isVideo(filePath) && !filePath.startsWith("http")) {
    return proxiedThumb(toJpgPath(filePath));
  }

  // 3. Fallback pour certains services : chercher dans les attachments
  if (FALLBACK_SERVICES.includes(post.service) && post.attachments?.length) {
    // 3a. Chercher une image dans les attachments
    const imageAtt = post.attachments.find(
      (att) => att.path && isImage(att.path) && !att.path.startsWith("http")
    );
    if (imageAtt) {
      return proxiedThumb(imageAtt.path);
    }

    // 3b. Essayer le trick .jpg sur un attachment vidéo
    const videoAtt = post.attachments.find(
      (att) => att.path && isVideo(att.path) && !att.path.startsWith("http")
    );
    if (videoAtt) {
      return proxiedThumb(toJpgPath(videoAtt.path));
    }
  }

  // 4. Dernier fallback : n'importe quel attachment avec le trick .jpg
  if (post.attachments?.length) {
    const anyAtt = post.attachments.find(
      (att) => att.path && !att.path.startsWith("http")
    );
    if (anyAtt) {
      if (isImage(anyAtt.path)) {
        return proxiedThumb(anyAtt.path);
      }
      if (isVideo(anyAtt.path)) {
        return proxiedThumb(toJpgPath(anyAtt.path));
      }
    }
  }

  return undefined;
}

/**
 * Détermine le type de média d'un post
 */
export function getPostType(post: UnifiedPost): "image" | "video" | "text" {
  const hasVideo = 
    post.attachments?.some((a) => isVideo(a.name || a.path)) || 
    isVideo(post.file?.path ?? "");
    
  if (hasVideo) return "video";

  const hasImage = 
    (post.file?.path && !isVideo(post.file.path)) || 
    post.attachments?.some((a) => isImage(a.name || a.path));
    
  if (hasImage) return "image";

  return "text";
}

/**
 * Retourne l'URL directe (source) de la vidéo d'un post (pas le thumbnail CDN)
 */
export function getPostVideoUrl(post: UnifiedPost): string | undefined {
  const base = post.site === "kemono" ? "https://kemono.su" : "https://coomer.su";

  if (post.file?.path && isVideo(post.file.path)) {
    return `${base}/data${encodeURI(post.file.path)}`;
  }

  const vidAttachment = post.attachments?.find((a) => isVideo(a.name || a.path));
  if (vidAttachment) {
    return `${base}/data${encodeURI(vidAttachment.path)}`;
  }

  return undefined;
}

/**
 * Retourne l'URL du proxy video-thumbnail pour le premier attachment vidéo d'un post.
 * Permet d'obtenir une image JPEG extraite de la vidéo via ffmpeg.
 */
export function getPostVideoThumbnailUrl(post: UnifiedPost): string | undefined {
  const filePath = post.file?.path;

  if (filePath && isVideo(filePath) && !filePath.startsWith("http")) {
    return getVideoThumbnailUrl(post.site, filePath);
  }

  const vidAtt = post.attachments?.find(
    (a) => a.path && isVideo(a.path) && !a.path.startsWith("http")
  );
  if (vidAtt) {
    return getVideoThumbnailUrl(post.site, vidAtt.path);
  }

  return undefined;
}


