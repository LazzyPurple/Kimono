import type { Site } from "./api/helpers.ts";

export const PLATFORM_BASE_URLS: Record<Site, string> = {
  kemono: "https://kemono.cr",
  coomer: "https://coomer.st",
};

export const PLATFORM_CDN_URLS: Record<Site, string> = {
  kemono: "https://img.kemono.cr",
  coomer: "https://img.coomer.st",
};

export type MediaKind = "image" | "video" | "unknown";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"];

function stripKnownOrigin(value: string): string {
  return value
    .replace(/^https?:\/\/kemono\.cr/i, "")
    .replace(/^https?:\/\/coomer\.st/i, "")
    .replace(/^https?:\/\/img\.kemono\.(?:cr|su)/i, "")
    .replace(/^https?:\/\/img\.coomer\.(?:st|su)/i, "");
}

function normalizePath(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  if (/^https?:\/\//i.test(input)) {
    return stripKnownOrigin(input);
  }

  return input.startsWith("/") ? input : `/${input}`;
}

function hasExtension(value: string | null | undefined, extensions: string[]): boolean {
  if (!value) {
    return false;
  }

  const clean = value.split("?")[0].toLowerCase();
  return extensions.some((extension) => clean.endsWith(extension));
}

export function detectMediaKind(input: {
  mimeType?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  type?: string | null;
}): MediaKind {
  const normalizedType = input.type?.toLowerCase();
  if (normalizedType === "image" || normalizedType === "video") {
    return normalizedType;
  }

  const mimeType = input.mimeType?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (hasExtension(input.videoUrl ?? null, VIDEO_EXTENSIONS)) {
    return "video";
  }
  if (hasExtension(input.imageUrl ?? null, IMAGE_EXTENSIONS)) {
    return "image";
  }

  return "unknown";
}

export function getThumbnailUrl(site: Site, source: string | null | undefined): string | null {
  const normalized = normalizePath(source);
  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//i.test(source ?? "") && !normalized.startsWith("/data/")) {
    return source ?? null;
  }

  if (normalized.startsWith("/thumbnail/")) {
    return `${PLATFORM_CDN_URLS[site]}${normalized}`;
  }

  if (normalized.startsWith("/data/")) {
    return `${PLATFORM_CDN_URLS[site]}/thumbnail${normalized}`;
  }

  return `${PLATFORM_CDN_URLS[site]}/thumbnail/data${normalized}`;
}

export function getFullResUrl(site: Site, source: string | null | undefined): string | null {
  const normalized = normalizePath(source);
  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//i.test(source ?? "") && !normalized.startsWith("/data/")) {
    return source ?? null;
  }

  if (normalized.startsWith("/data/")) {
    return `${PLATFORM_BASE_URLS[site]}${normalized}`;
  }

  return `${PLATFORM_BASE_URLS[site]}/data${normalized}`;
}

export function getCreatorIconUrl(site: Site, service: string, creatorId: string): string {
  return `${PLATFORM_CDN_URLS[site]}/icons/${service}/${creatorId}`;
}

export function getCreatorBannerUrl(site: Site, service: string, creatorId: string): string {
  return `${PLATFORM_CDN_URLS[site]}/banners/${service}/${creatorId}`;
}

export function createMediaPlatform() {
  return {
    detectMediaKind,
    getThumbnailUrl,
    getFullResUrl,
    getCreatorIconUrl,
    getCreatorBannerUrl,
  };
}
