import type { UnifiedPost } from "./api/helpers.ts";
import type { PerformanceRepository, PostCacheRecord } from "./perf-repository.ts";
import { getPerformanceRepository } from "./perf-repository.ts";
import { buildPreviewAssetPublicUrl } from "./popular-preview-assets.ts";

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
  repository?: PreviewLookupRepository
): Promise<PreviewLookupRepository> {
  if (repository) {
    return repository;
  }

  return getPerformanceRepository();
}

export async function hydratePostsWithCachedPreviewAssets(
  posts: UnifiedPost[],
  options: {
    repository?: PreviewLookupRepository;
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
    repository?: PreviewLookupRepository;
  } = {}
): Promise<UnifiedPost> {
  const [hydrated] = await hydratePostsWithCachedPreviewAssets([post], options);
  return hydrated ?? post;
}
