import type { Creator, Post } from "./kemono.ts";

export type Site = "kemono" | "coomer";

export interface PostVideoSource {
  path: string;
  sourceFingerprint: string;
  upstreamUrl: string;
  localSourceAvailable: boolean;
  sourceCacheStatus: string | null;
  localStreamUrl: string | null;
}

export interface UnifiedPost extends Post {
  site: Site;
  previewThumbnailUrl?: string | null;
  previewClipUrl?: string | null;
  longestVideoUrl?: string | null;
  longestVideoDurationSeconds?: number | null;
  previewStatus?: string | null;
  previewGeneratedAt?: string | null;
  previewError?: string | null;
  previewSourceFingerprint?: string | null;
  mediaKind?: "image" | "video" | "unknown" | null;
  mediaProbeStatus?: string | null;
  mediaArtifactStatus?: string | null;
  nativeThumbnailUrl?: string | null;
  mediaMimeType?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  isMediaHot?: boolean | null;
  localSourceAvailable?: boolean | null;
  sourceCacheStatus?: string | null;
  sourceRetentionUntil?: string | null;
  priorityClass?: "regular" | "popular" | "liked" | "playback" | null;
  videoSources?: PostVideoSource[];
}

export interface UnifiedCreator extends Omit<Creator, "indexed" | "updated" | "favorited"> {
  site: Site;
  indexed?: string;
  updated?: string;
  favorited?: number | null;
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

export interface ResolvedListingPostMedia extends ResolvedPostMedia {
  videoCandidates: string[];
  durationSeconds: number | null;
  previewStatus: string | null;
  usesServerPreview: boolean;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

function toDataUrl(site: Site, path?: string): string | undefined {
  if (!path || path.startsWith("http")) {
    return path || undefined;
  }

  return `${SITE_BASE_URLS[site]}/data${encodeURI(path)}`;
}

function toThumbnailUrl(site: Site, path?: string): string | undefined {
  if (!path || path.startsWith("http")) {
    return path || undefined;
  }

  return `${SITE_CDN_URLS[site]}/thumbnail/data${encodeURI(path)}`;
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
    previewImageUrl: imagePath ? toThumbnailUrl(post.site, imagePath) : undefined,
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

export function getPostVideoEntries(post: UnifiedPost): Array<{ path: string; url: string }> {
  const paths = [
    post.file?.path,
    ...(post.attachments?.map((attachment) => attachment.path) ?? []),
  ].filter((path): path is string => Boolean(path) && isVideo(path));

  return paths
    .map((path) => ({ path, url: toDataUrl(post.site, path) }))
    .filter((entry): entry is { path: string; url: string } => Boolean(entry.url));
}

export function getPostVideoUrls(post: UnifiedPost): string[] {
  return getPostVideoEntries(post).map((entry) => entry.url);
}

export function resolveListingPostMedia(post: UnifiedPost): ResolvedListingPostMedia {
  const media = resolvePostMedia(post);
  const usesServerPreview = Boolean(
    post.previewThumbnailUrl || post.previewClipUrl || post.longestVideoDurationSeconds != null
  );
  const isThumbnailOnlyServerPreview = post.previewStatus === "thumbnail-ready"
    && Boolean(post.previewThumbnailUrl)
    && !post.previewClipUrl;
  const videoUrl = isThumbnailOnlyServerPreview ? undefined : post.previewClipUrl ?? media.videoUrl;
  const videoCandidates = post.previewClipUrl
    ? [post.previewClipUrl]
    : isThumbnailOnlyServerPreview
      ? []
      : getPostVideoUrls(post);

  return {
    type: media.type === "video" || videoUrl ? "video" : media.type,
    previewImageUrl: post.previewThumbnailUrl ?? post.nativeThumbnailUrl ?? media.previewImageUrl,
    videoUrl,
    videoCandidates,
    durationSeconds: post.longestVideoDurationSeconds ?? null,
    previewStatus: post.previewStatus ?? null,
    usesServerPreview,
    mimeType: post.mediaMimeType ?? null,
    width: post.mediaWidth ?? null,
    height: post.mediaHeight ?? null,
  };
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
