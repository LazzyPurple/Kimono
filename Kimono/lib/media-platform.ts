import {
  buildPreviewAssetPublicUrl,
  createPreviewSourceFingerprint,
} from "./popular-preview-assets.ts";
import {
  getFullImageUrl,
  getPostVideoUrls,
  isImage,
  type UnifiedPost,
} from "./api/helpers.ts";
import type {
  MediaSourceCacheRecord,
  MediaSourcePriorityClass,
  PerformanceRepository,
  PreviewAssetCacheInput,
  PreviewAssetCacheRecord,
  Site,
} from "./db/index.ts";

const MEDIA_HOT_WINDOW_MS = 72 * 60 * 60 * 1000;

type MediaKind = "image" | "video" | "unknown";

type MediaPlatformRepository = Pick<
  PerformanceRepository,
  "getPreviewAssetCache" | "upsertPreviewAssetCache" | "touchPreviewAssetCache"
> & Partial<Pick<
  PerformanceRepository,
  "getMediaSourceCache" | "touchMediaSourceCache"
>>;

interface ObserveMediaContext {
  context: string;
  now?: Date;
}

interface ScheduleGenerationInput {
  site: Site;
  sourceFingerprint: string;
  sourceMediaUrl: string;
  mediaKind: MediaKind;
  context: string;
  post: UnifiedPost;
  priorityClass?: MediaSourcePriorityClass | null;
}

export interface MediaSourceProbeResult {
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
}

interface ProbeMediaSourceInput {
  site: Site;
  sourceFingerprint: string;
  sourceMediaUrl: string;
  mediaKind: MediaKind;
  context: string;
  post: UnifiedPost;
}

interface MediaPlatformDependencies {
  repository: MediaPlatformRepository;
  probeMediaSource?: (input: ProbeMediaSourceInput) => Promise<MediaSourceProbeResult | null>;
  scheduleGeneration?: (input: ScheduleGenerationInput) => Promise<void>;
  resolvePriorityClass?: (input: { post: UnifiedPost; context: string }) => MediaSourcePriorityClass | null | undefined;
}

interface PrimaryMediaSource {
  mediaKind: MediaKind;
  sourceMediaUrl: string;
  nativeThumbnailUrl: string | null;
}

function addHotWindow(now: Date): Date {
  return new Date(now.getTime() + MEDIA_HOT_WINDOW_MS);
}

function resolvePrimaryMediaSource(post: UnifiedPost): PrimaryMediaSource | null {
  const videoUrls = getPostVideoUrls(post);
  if (videoUrls.length > 0) {
    return {
      mediaKind: "video",
      sourceMediaUrl: videoUrls[0],
      nativeThumbnailUrl: null,
    };
  }

  const imagePath = [post.file?.path, ...(post.attachments?.map((attachment) => attachment.path) ?? [])]
    .filter((path): path is string => Boolean(path))
    .find((path) => isImage(path));

  if (!imagePath) {
    return null;
  }

  return {
    mediaKind: "image",
    sourceMediaUrl: getFullImageUrl(post.site, imagePath),
    nativeThumbnailUrl: post.previewThumbnailUrl ?? null,
  };
}

function hydratePostFromSourceRecord(post: UnifiedPost, record: MediaSourceCacheRecord | null | undefined): UnifiedPost {
  if (!record) {
    return post;
  }

  return {
    ...post,
    localSourceAvailable: post.localSourceAvailable ?? Boolean(record.localVideoPath && record.downloadStatus === "source-ready"),
    sourceCacheStatus: post.sourceCacheStatus ?? record.downloadStatus,
    sourceRetentionUntil: post.sourceRetentionUntil ?? record.retentionUntil?.toISOString() ?? null,
    priorityClass: post.priorityClass ?? record.priorityClass ?? null,
    mediaMimeType: post.mediaMimeType ?? record.mimeType ?? null,
  };
}

function hydratePostFromMediaRecord(
  post: UnifiedPost,
  record: PreviewAssetCacheRecord,
  now: Date
): UnifiedPost {
  return {
    ...post,
    previewThumbnailUrl:
      post.previewThumbnailUrl
      ?? buildPreviewAssetPublicUrl(record.thumbnailAssetPath)
      ?? record.nativeThumbnailUrl
      ?? undefined,
    previewClipUrl: post.previewClipUrl ?? buildPreviewAssetPublicUrl(record.clipAssetPath) ?? undefined,
    longestVideoDurationSeconds:
      post.longestVideoDurationSeconds ?? record.durationSeconds ?? null,
    previewStatus: post.previewStatus ?? record.artifactStatus ?? record.status,
    previewGeneratedAt: post.previewGeneratedAt ?? record.generatedAt?.toISOString() ?? null,
    previewError: post.previewError ?? record.error ?? record.lastError ?? null,
    previewSourceFingerprint: post.previewSourceFingerprint ?? record.sourceFingerprint,
    mediaKind: post.mediaKind ?? record.mediaKind ?? null,
    mediaProbeStatus: post.mediaProbeStatus ?? record.probeStatus ?? null,
    mediaArtifactStatus: post.mediaArtifactStatus ?? record.artifactStatus ?? record.status,
    nativeThumbnailUrl: post.nativeThumbnailUrl ?? record.nativeThumbnailUrl ?? null,
    mediaMimeType: post.mediaMimeType ?? record.mimeType ?? null,
    mediaWidth: post.mediaWidth ?? record.width ?? null,
    mediaHeight: post.mediaHeight ?? record.height ?? null,
    isMediaHot: post.isMediaHot ?? Boolean(record.hotUntil && record.hotUntil >= now),
  };
}

function hasProbeMetadata(probe: MediaSourceProbeResult | null | undefined): boolean {
  if (!probe) {
    return false;
  }

  return probe.durationSeconds != null
    || probe.width != null
    || probe.height != null
    || typeof probe.mimeType === "string";
}

function createPendingMediaRecord(input: {
  site: Site;
  sourceFingerprint: string;
  sourceMediaUrl: string;
  mediaKind: MediaKind;
  nativeThumbnailUrl: string | null;
  probe: MediaSourceProbeResult | null;
  now: Date;
  context: string;
}): PreviewAssetCacheInput {
  return {
    site: input.site,
    sourceVideoUrl: input.sourceMediaUrl,
    sourceFingerprint: input.sourceFingerprint,
    durationSeconds: input.probe?.durationSeconds ?? null,
    thumbnailAssetPath: null,
    clipAssetPath: null,
    status: "pending",
    generatedAt: input.now,
    lastSeenAt: input.now,
    error: null,
    mediaKind: input.mediaKind,
    mimeType: input.probe?.mimeType ?? null,
    width: input.probe?.width ?? null,
    height: input.probe?.height ?? null,
    nativeThumbnailUrl: input.nativeThumbnailUrl,
    probeStatus: hasProbeMetadata(input.probe) ? "probed" : "pending",
    artifactStatus: "pending",
    firstSeenAt: input.now,
    hotUntil: addHotWindow(input.now),
    retryAfter: null,
    generationAttempts: 0,
    lastError: null,
    lastObservedContext: input.context,
  };
}

export function createMediaPlatform(dependencies: MediaPlatformDependencies) {
  const scheduleGeneration = dependencies.scheduleGeneration ?? (async () => {});
  const probeMediaSource = dependencies.probeMediaSource ?? (async () => null);

  return {
    async observeAndHydratePosts(posts: UnifiedPost[], context: ObserveMediaContext): Promise<UnifiedPost[]> {
      const now = context.now ?? new Date();

      return Promise.all(
        posts.map(async (post) => {
          const source = resolvePrimaryMediaSource(post);
          if (!source) {
            return post;
          }

          const sourceFingerprint = createPreviewSourceFingerprint(post.site, source.sourceMediaUrl);
          const [cachedPreview, cachedSource] = await Promise.all([
            dependencies.repository.getPreviewAssetCache({
              site: post.site,
              sourceFingerprint,
            }),
            dependencies.repository.getMediaSourceCache?.({
              site: post.site,
              sourceFingerprint,
            }) ?? Promise.resolve(null),
          ]);

          if (cachedPreview) {
            await dependencies.repository.touchPreviewAssetCache({
              site: post.site,
              sourceFingerprint,
              lastSeenAt: now,
            });
          }

          if (cachedSource && dependencies.repository.touchMediaSourceCache) {
            await dependencies.repository.touchMediaSourceCache({
              site: post.site,
              sourceFingerprint,
              lastSeenAt: now,
            });
          }

          let hydrated = cachedPreview
            ? hydratePostFromMediaRecord(post, cachedPreview, now)
            : post;
          hydrated = hydratePostFromSourceRecord(hydrated, cachedSource);

          if (cachedPreview) {
            return hydrated;
          }

          let probe: MediaSourceProbeResult | null = null;
          if (source.mediaKind === "video") {
            try {
              probe = await probeMediaSource({
                site: post.site,
                sourceFingerprint,
                sourceMediaUrl: source.sourceMediaUrl,
                mediaKind: source.mediaKind,
                context: context.context,
                post,
              });
            } catch {
              probe = null;
            }
          }

          const pendingRecord = createPendingMediaRecord({
            site: post.site,
            sourceFingerprint,
            sourceMediaUrl: source.sourceMediaUrl,
            mediaKind: source.mediaKind,
            nativeThumbnailUrl: source.nativeThumbnailUrl,
            probe,
            now,
            context: context.context,
          });

          await dependencies.repository.upsertPreviewAssetCache(pendingRecord);
          await scheduleGeneration({
            site: post.site,
            sourceFingerprint,
            sourceMediaUrl: source.sourceMediaUrl,
            mediaKind: source.mediaKind,
            context: context.context,
            post,
            priorityClass: dependencies.resolvePriorityClass?.({ post, context: context.context }) ?? cachedSource?.priorityClass ?? null,
          });

          hydrated = hydratePostFromMediaRecord(
            hydrated,
            {
              ...pendingRecord,
              durationSeconds: pendingRecord.durationSeconds ?? null,
              thumbnailAssetPath: null,
              clipAssetPath: null,
              error: null,
              generatedAt: pendingRecord.generatedAt,
              lastSeenAt: pendingRecord.lastSeenAt,
              mediaKind: pendingRecord.mediaKind ?? null,
              mimeType: pendingRecord.mimeType ?? null,
              width: pendingRecord.width ?? null,
              height: pendingRecord.height ?? null,
              nativeThumbnailUrl: pendingRecord.nativeThumbnailUrl ?? null,
              probeStatus: pendingRecord.probeStatus ?? null,
              artifactStatus: pendingRecord.artifactStatus ?? null,
              firstSeenAt: pendingRecord.firstSeenAt ?? null,
              hotUntil: pendingRecord.hotUntil ?? null,
              retryAfter: pendingRecord.retryAfter ?? null,
              generationAttempts: pendingRecord.generationAttempts ?? null,
              lastError: pendingRecord.lastError ?? null,
              lastObservedContext: pendingRecord.lastObservedContext ?? null,
            },
            now
          );
          return hydratePostFromSourceRecord(hydrated, cachedSource);
        })
      );
    },
  };
}

