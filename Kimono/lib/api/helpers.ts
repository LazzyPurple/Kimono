import type { Creator, Post } from "./kemono";

export type Site = "kemono" | "coomer";

export interface UnifiedPost extends Post {
  site: Site;
}

export interface UnifiedCreator extends Omit<Creator, "indexed" | "updated"> {
  site: Site;
  indexed?: string;
  updated?: string;
}

const SITE_BASE_URLS = {
  kemono: "https://kemono.cr",
  coomer: "https://coomer.st",
} as const;

const SITE_CDN_URLS = {
  kemono: "https://img.kemono.cr",
  coomer: "https://img.coomer.st",
} as const;

const IMAGE_EXTENSIONS = [".gif", ".jpeg", ".jpg", ".jpe", ".png", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"];

export interface ResolvedPostMedia {
  type: "image" | "video" | "text";
  previewImageUrl?: string;
  videoUrl?: string;
}

function toDataUrl(site: Site, path?: string): string | undefined {
  if (!path || path.startsWith("http")) {
    return path || undefined;
  }

  return `${SITE_BASE_URLS[site]}/data${encodeURI(path)}`;
}

function findFirstMediaPath(
  post: UnifiedPost,
  predicate: (path: string) => boolean
): string | undefined {
  const mainPath = post.file?.path;
  if (mainPath && predicate(mainPath)) {
    return mainPath;
  }

  const attachmentPath = post.attachments?.find(
    (attachment) => attachment.path && predicate(attachment.path)
  )?.path;

  return attachmentPath;
}

export function isVideo(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isImage(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function proxyCdnUrl(site: Site, path: string): string {
  return `${SITE_CDN_URLS[site]}${path}`;
}

export function getFullImageUrl(site: Site, path: string): string {
  return toDataUrl(site, path) || "";
}

export function resolvePostMedia(post: UnifiedPost): ResolvedPostMedia {
  const imagePath = findFirstMediaPath(post, isImage);
  const videoPath = findFirstMediaPath(post, isVideo);

  return {
    type: videoPath ? "video" : imagePath ? "image" : "text",
    previewImageUrl: imagePath ? toDataUrl(post.site, imagePath) : undefined,
    videoUrl: videoPath ? toDataUrl(post.site, videoPath) : undefined,
  };
}

export function getPostPreviewImageUrl(post: UnifiedPost): string | undefined {
  return resolvePostMedia(post).previewImageUrl;
}

export function getPostType(post: UnifiedPost): "image" | "video" | "text" {
  return resolvePostMedia(post).type;
}

export function getPostVideoUrl(post: UnifiedPost): string | undefined {
  return resolvePostMedia(post).videoUrl;
}

export function deduplicatePosts(posts: UnifiedPost[]): UnifiedPost[] {
  const seen = new Set<string>();

  return posts.filter((post) => {
    const key = `${post.site}-${post.service}-${post.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function deduplicateCreators(creators: UnifiedCreator[]): UnifiedCreator[] {
  const seen = new Set<string>();

  return creators.filter((creator) => {
    const key = `${creator.site}-${creator.service}-${creator.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}