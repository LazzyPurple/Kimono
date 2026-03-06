import type { Creator, Post } from "./kemono";

// Types unifiés avec indicateur de site source
export type Site = "kemono" | "coomer";

export interface UnifiedPost extends Post {
  site: Site;
}

export interface UnifiedCreator extends Creator {
  site: Site;
}

const IMAGE_EXTENSIONS = [".gif", ".jpeg", ".jpg", ".jpe", ".png", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"];
// Services qui ont souvent le fichier principal vide et les contenus dans les attachments
const FALLBACK_SERVICES = ["fansly", "candfans", "boosty", "gumroad"];

export function isVideo(p: string): boolean {
  const lower = p.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
export function isImage(p: string): boolean {
  const lower = p.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Remplace l'extension d'un path par .jpg
 */
export function toJpgPath(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return filePath + ".jpg";
  return filePath.substring(0, lastDot) + ".jpg";
}

/* ── Proxy helpers ──────────────────────────────────────────── */

/**
 * Enveloppe une URL externe dans le proxy thumbnail local.
 */
export function proxyUrl(externalUrl: string): string {
  return `/api/thumbnail?url=${encodeURIComponent(externalUrl)}`;
}

/**
 * Construit une URL CDN (avatar, banner…) et la proxifie automatiquement.
 */
export function proxyCdnUrl(site: Site, path: string): string {
  const cdn = site === "kemono" ? "https://img.kemono.cr" : "https://img.coomer.st";
  return proxyUrl(`${cdn}${path}`);
}

/**
 * Construit une URL pour le proxy video-thumbnail (extraction ffmpeg).
 */
export function getVideoThumbnailUrl(site: Site, filePath: string): string | undefined {
  const base = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
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
  const base = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  return proxyUrl(`${base}/data${encodeURI(path)}`);
}

/**
 * Construit l'URL d'une miniature depuis un post.
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

  // 2. Fichier principal est une vidéo → ignorer les thumbnails statiques pour toutes les vidéos
  if (filePath && isVideo(filePath) && !filePath.startsWith("http")) {
    return undefined;
  }

  // 3. Fallback pour certains services : chercher dans les attachments
  if (FALLBACK_SERVICES.includes(post.service) && post.attachments?.length) {
    const imageAtt = post.attachments.find(
      (att) => att.path && isImage(att.path) && !att.path.startsWith("http")
    );
    if (imageAtt) {
      return proxiedThumb(imageAtt.path);
    }

    const videoAtt = post.attachments.find(
      (att) => att.path && isVideo(att.path) && !att.path.startsWith("http")
    );
    if (videoAtt?.path) {
      return undefined;
    }
  }

  // 4. Dernier fallback : n'importe quel attachment
  if (post.attachments?.length) {
    const anyAtt = post.attachments.find(
      (att) => att.path && !att.path.startsWith("http")
    );
    if (anyAtt) {
      if (isImage(anyAtt.path)) {
        return proxiedThumb(anyAtt.path);
      }
      if (isVideo(anyAtt.path)) {
        return undefined;
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
 * Retourne l'URL directe (source) de la vidéo d'un post
 */
export function getPostVideoUrl(post: UnifiedPost): string | undefined {
  const base = post.site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

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

/**
 * Déduplique les posts par ID + service
 */
export function deduplicatePosts(posts: UnifiedPost[]): UnifiedPost[] {
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
export function deduplicateCreators(creators: UnifiedCreator[]): UnifiedCreator[] {
  const seen = new Set<string>();
  return creators.filter((creator) => {
    const key = `${creator.site}-${creator.service}-${creator.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
