import type { UnifiedPost } from "./api/helpers.ts";
import type {
  MediaSourcePriorityClass,
  PerformanceRepository,
  PostCacheRecord,
  Site,
} from "./db/index.ts";
import { getPerformanceRepository } from "./db/index.ts";
import {
  analyzeVideoSourceLightweight,
  buildPreviewAssetPublicUrl,
  createPopularPreviewAssetService,
  type PreviewGenerationStrategy,
} from "./popular-preview-assets.ts";
import { createMediaPlatform, type MediaSourceProbeResult } from "./media-platform.ts";

type PreviewCacheFields = Pick<
  PostCacheRecord,
  | "longestVideoUrl"
  | "longestVideoDurationSeconds"
  | "previewThumbnailAssetPath"
  | "previewClipAssetPath"
  | "previewStatus"
  | "previewGeneratedAt"
  | "previewError"
  | "previewSourceFingerprint"
>;

type PreviewLookupRepository = Pick<PerformanceRepository, "getPostCache">;
type MediaPlatformHydrationRepository = Pick<
  PerformanceRepository,
  | "getPostCache"
  | "getPreviewAssetCache"
  | "upsertPreviewAssetCache"
  | "touchPreviewAssetCache"
> & Partial<Pick<
  PerformanceRepository,
  | "getMediaSourceCache"
  | "touchMediaSourceCache"
>>;
type MediaPreviewGenerationRepository = Pick<
  PerformanceRepository,
  | "getPreviewAssetCache"
  | "upsertPreviewAssetCache"
  | "touchPreviewAssetCache"
  | "listPreviewAssetCachesOlderThan"
  | "deletePreviewAssetCaches"
  | "getMediaSourceCache"
  | "upsertMediaSourceCache"
  | "touchMediaSourceCache"
  | "listExpiredMediaSourceCaches"
  | "deleteMediaSourceCaches"
  | "getMediaSourceCacheStats"
  | "getPreviewAssetStats"
>;
type SharedPreviewLookupRepository = PreviewLookupRepository | MediaPlatformHydrationRepository;

export interface SharedPreviewGenerationInput {
  site: Site;
  sourceFingerprint: string;
  sourceMediaUrl: string;
  mediaKind: "image" | "video" | "unknown";
  context: string;
  post: UnifiedPost;
  priorityClass?: MediaSourcePriorityClass | null;
}

interface HydratePostsWithMediaPlatformOptions {
  repository?: SharedPreviewLookupRepository;
  context: string;
  now?: Date;
  schedulePreviewGeneration?: (input: SharedPreviewGenerationInput) => Promise<void>;
  probeMediaSource?: (input: SharedPreviewGenerationInput) => Promise<MediaSourceProbeResult | null>;
  resolveGenerationStrategy?: (input: { post: UnifiedPost; context: string }) => PreviewGenerationStrategy;
  resolvePriorityClass?: (input: { post: UnifiedPost; context: string }) => MediaSourcePriorityClass | null | undefined;
}

function toPublicPreviewUrl(assetPath: string | null | undefined): string | null {
  if (!assetPath) {
    return null;
  }

  return buildPreviewAssetPublicUrl(assetPath);
}

export function applyCachedPreviewFields(
  post: UnifiedPost,
  cached: PreviewCacheFields | null | undefined
): UnifiedPost {
  if (!cached) {
    return post;
  }

  const previewThumbnailUrl = toPublicPreviewUrl(cached.previewThumbnailAssetPath);
  const previewClipUrl = toPublicPreviewUrl(cached.previewClipAssetPath);

  return {
    ...post,
    longestVideoUrl: post.longestVideoUrl ?? cached.longestVideoUrl ?? null,
    longestVideoDurationSeconds:
      post.longestVideoDurationSeconds ?? cached.longestVideoDurationSeconds ?? null,
    previewThumbnailUrl: post.previewThumbnailUrl ?? previewThumbnailUrl ?? undefined,
    previewClipUrl: post.previewClipUrl ?? previewClipUrl ?? undefined,
    previewStatus: post.previewStatus ?? cached.previewStatus ?? null,
    previewGeneratedAt:
      post.previewGeneratedAt ?? cached.previewGeneratedAt?.toISOString() ?? null,
    previewError: post.previewError ?? cached.previewError ?? null,
    previewSourceFingerprint:
      post.previewSourceFingerprint ?? cached.previewSourceFingerprint ?? null,
  };
}

async function resolveRepository(
  repository?: SharedPreviewLookupRepository
): Promise<SharedPreviewLookupRepository> {
  if (repository) {
    return repository;
  }

  return getPerformanceRepository();
}

function supportsMediaPlatform(
  repository: SharedPreviewLookupRepository
): repository is MediaPlatformHydrationRepository {
  const mediaRepository = repository as MediaPlatformHydrationRepository;
  return typeof mediaRepository.getPreviewAssetCache === "function"
    && typeof mediaRepository.upsertPreviewAssetCache === "function"
    && typeof mediaRepository.touchPreviewAssetCache === "function";
}

function supportsSharedPreviewGeneration(
  repository: SharedPreviewLookupRepository
): repository is MediaPlatformHydrationRepository & MediaPreviewGenerationRepository {
  const generationRepository = repository as unknown as MediaPreviewGenerationRepository;
  return supportsMediaPlatform(repository)
    && typeof generationRepository.listPreviewAssetCachesOlderThan === "function"
    && typeof generationRepository.deletePreviewAssetCaches === "function"
    && typeof generationRepository.upsertMediaSourceCache === "function"
    && typeof generationRepository.listExpiredMediaSourceCaches === "function"
    && typeof generationRepository.deleteMediaSourceCaches === "function"
    && typeof generationRepository.getMediaSourceCacheStats === "function"
    && typeof generationRepository.getPreviewAssetStats === "function";
}

function getDefaultPreviewGenerationStrategy(post: UnifiedPost): PreviewGenerationStrategy {
  return post.site === "coomer" ? "thumbnail-first" : "full";
}

function createSharedMediaProbe() {
  return async (input: SharedPreviewGenerationInput): Promise<MediaSourceProbeResult | null> => {
    if (input.mediaKind !== "video") {
      return null;
    }

    return analyzeVideoSourceLightweight({
      site: input.site,
      sourceVideoUrl: input.sourceMediaUrl,
    });
  };
}

function createSharedPreviewGenerationScheduler(
  repository: MediaPlatformHydrationRepository & MediaPreviewGenerationRepository,
  options: {
    resolveGenerationStrategy?: (input: { post: UnifiedPost; context: string }) => PreviewGenerationStrategy;
  } = {}
) {
  let previewAssetServicePromise: Promise<ReturnType<typeof createPopularPreviewAssetService>> | null = null;
  const getPreviewAssetService = () => {
    previewAssetServicePromise ??= Promise.resolve(createPopularPreviewAssetService({ repository }));
    return previewAssetServicePromise;
  };

  return async (input: SharedPreviewGenerationInput) => {
    if (input.mediaKind !== "video") {
      return;
    }

    void (async () => {
      try {
        const previewAssetService = await getPreviewAssetService();
        await previewAssetService.preparePreviewForPost({
          site: input.site,
          post: input.post,
          priorityClass: input.priorityClass ?? undefined,
          generationStrategy: options.resolveGenerationStrategy?.({
            post: input.post,
            context: input.context,
          }) ?? getDefaultPreviewGenerationStrategy(input.post),
        });
      } catch {
        // Opportunistic generation stays best-effort in shared flows.
      }
    })();
  };
}

export async function hydratePostsWithCachedPreviewAssets(
  posts: UnifiedPost[],
  options: {
    repository?: SharedPreviewLookupRepository;
  } = {}
): Promise<UnifiedPost[]> {
  if (posts.length === 0) {
    return posts;
  }

  const repository = await resolveRepository(options.repository);

  return Promise.all(
    posts.map(async (post) => {
      const cached = await repository.getPostCache({
        site: post.site,
        service: post.service,
        creatorId: post.user,
        postId: post.id,
      });

      return applyCachedPreviewFields(post, cached);
    })
  );
}

export async function hydratePostWithCachedPreviewAssets(
  post: UnifiedPost,
  options: {
    repository?: SharedPreviewLookupRepository;
  } = {}
): Promise<UnifiedPost> {
  const [hydrated] = await hydratePostsWithCachedPreviewAssets([post], options);
  return hydrated ?? post;
}

export async function hydratePostsWithMediaPlatform(
  posts: UnifiedPost[],
  options: HydratePostsWithMediaPlatformOptions
): Promise<UnifiedPost[]> {
  if (posts.length === 0) {
    return posts;
  }

  const repository = await resolveRepository(options.repository);
  const hydratedPosts = await hydratePostsWithCachedPreviewAssets(posts, {
    repository,
  });

  if (!supportsMediaPlatform(repository)) {
    return hydratedPosts;
  }

  const schedulePreviewGeneration = options.schedulePreviewGeneration
    ?? (supportsSharedPreviewGeneration(repository)
      ? createSharedPreviewGenerationScheduler(repository, {
          resolveGenerationStrategy: options.resolveGenerationStrategy,
        })
      : undefined);

  const mediaPlatform = createMediaPlatform({
    repository,
    probeMediaSource: options.probeMediaSource ?? createSharedMediaProbe(),
    scheduleGeneration: schedulePreviewGeneration,
    resolvePriorityClass: options.resolvePriorityClass,
  });

  return mediaPlatform.observeAndHydratePosts(hydratedPosts, {
    context: options.context,
    now: options.now,
  });
}

export async function hydratePostWithMediaPlatform(
  post: UnifiedPost,
  options: HydratePostsWithMediaPlatformOptions
): Promise<UnifiedPost> {
  const [hydrated] = await hydratePostsWithMediaPlatform([post], options);
  return hydrated ?? post;
}

