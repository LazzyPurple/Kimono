export type KimonoSite = "kemono" | "coomer";

export type KimonoService =
  | "patreon"
  | "fanbox"
  | "subscribestar"
  | "gumroad"
  | "discord"
  | "dlsite"
  | "fantia"
  | "boosty"
  | "afdian"
  | "onlyfans"
  | "fansly"
  | "candfans";

export type PostDetailLevel = "preview" | "full";
export type PostSourceKind = "upstream" | "snapshot" | "popular" | "recent" | "favorite" | "search";
export type MediaKind = "image" | "video" | "unknown";
export type MediaPriorityClass = "liked" | "playback" | null;
export type FavoriteKind = "creator" | "post";

export interface CreatorRow {
  site: KimonoSite;
  service: KimonoService | string;
  creatorId: string;
  name: string;
  normalizedName: string;
  indexed: number | null;
  updated: number | null;
  favorited: number;
  postCount: number;
  publicId: string | null;
  relationId: number | null;
  dmCount: number;
  shareCount: number;
  hasChats: boolean;
  chatCount: number;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  rawIndexPayload: string | null;
  rawProfilePayload: string | null;
  catalogSyncedAt: Date;
  profileCachedAt: Date | null;
  profileExpiresAt: Date | null;
  archivedAt: Date | null;
}

export type InsertCreatorRow = Omit<CreatorRow, "catalogSyncedAt" | "archivedAt"> & {
  catalogSyncedAt?: Date;
  archivedAt?: Date | null;
};

export interface PostRow {
  site: KimonoSite;
  service: KimonoService | string;
  creatorId: string;
  postId: string;
  title: string | null;
  contentHtml: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  addedAt: Date | null;
  editedAt: Date | null;
  fileName: string | null;
  filePath: string | null;
  attachmentsJson: string | null;
  embedJson: string | null;
  tagsJson: string | null;
  prevPostId: string | null;
  nextPostId: string | null;
  favCount: number;
  previewImageUrl: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
  mediaType: string | null;
  authorName: string | null;
  rawPreviewPayload: string | null;
  rawDetailPayload: string | null;
  detailLevel: PostDetailLevel;
  sourceKind: PostSourceKind;
  isPopular: boolean;
  primaryPopularPeriod: "recent" | "day" | "week" | "month" | null;
  primaryPopularDate: string | null;
  primaryPopularOffset: number | null;
  primaryPopularRank: number | null;
  popularContextsJson: string | null;
  longestVideoUrl: string | null;
  longestVideoDurationSeconds: number | null;
  previewStatus: string | null;
  nativeThumbnailUrl: string | null;
  previewThumbnailAssetPath: string | null;
  previewClipAssetPath: string | null;
  previewGeneratedAt: Date | null;
  previewError: string | null;
  previewSourceFingerprint: string | null;
  mediaMimeType: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  cachedAt: Date;
  expiresAt: Date;
  staleUntil: Date | null;
  lastSeenAt: Date | null;
}

export interface MediaAssetRow {
  site: KimonoSite;
  sourceFingerprint: string;
  sourceUrl: string;
  sourcePath: string | null;
  mediaKind: MediaKind;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  nativeThumbnailUrl: string | null;
  thumbnailAssetPath: string | null;
  clipAssetPath: string | null;
  probeStatus: string | null;
  previewStatus: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  hotUntil: Date | null;
  retryAfter: Date | null;
  generationAttempts: number;
  lastError: string | null;
  lastObservedContext: string | null;
  cachedAt: Date;
  expiresAt: Date | null;
}

export interface MediaSourceRow {
  site: KimonoSite;
  sourceFingerprint: string;
  sourceUrl: string;
  sourcePath: string | null;
  localPath: string | null;
  downloadStatus: string;
  downloadedAt: Date | null;
  lastSeenAt: Date;
  retentionUntil: Date | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  downloadError: string | null;
  downloadAttempts: number;
  lastObservedContext: string | null;
  priorityClass: MediaPriorityClass;
  retryAfter: Date | null;
  firstSeenAt: Date;
}

export interface FavoriteChronologyRow {
  kind: FavoriteKind;
  site: KimonoSite;
  service: string;
  creatorId: string;
  postId: string;
  favoritedAt: Date;
  lastConfirmedAt: Date | null;
  favedSeq: number | null;
}

export interface FavoriteCacheRow {
  kind: FavoriteKind;
  site: KimonoSite;
  payloadJson: string;
  updatedAt: Date;
  expiresAt: Date;
}

export interface DiscoveryCacheRow {
  site: KimonoSite | "global";
  payloadJson: string;
  updatedAt: Date;
  expiresAt: Date;
}

export interface DiscoveryBlockRow {
  site: KimonoSite;
  service: string;
  creatorId: string;
  blockedAt: Date;
}

export interface KimonoSessionRow {
  id: string;
  site: KimonoSite;
  cookie: string;
  username: string;
  savedAt: Date;
}

export interface SearchCreatorsOpts {
  site?: KimonoSite;
  q?: string;
  service?: KimonoService | string;
  sort?: "favorited" | "updated" | "name";
  order?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export interface SearchCreatorsResult {
  rows: CreatorRow[];
  total: number;
  snapshotFresh: boolean;
}


