import {
  getPostVideoEntries,
  type PostVideoSource,
  type UnifiedPost,
} from "./api/helpers.ts";
import {
  buildMediaSourcePublicUrl,
  createPreviewSourceFingerprint,
} from "./popular-preview-assets.ts";
import type { PerformanceRepository } from "./db/index.ts";

type MediaSourceLookupRepository = Pick<PerformanceRepository, "getMediaSourceCache">;

export interface RequestedPostVideoSource {
  path: string;
  upstreamUrl: string;
  sourceFingerprint: string;
}

export function resolveRequestedPostVideoSource(
  post: UnifiedPost,
  requestedPath: string
): RequestedPostVideoSource | null {
  const match = getPostVideoEntries(post).find((entry) => entry.path === requestedPath);
  if (!match) {
    return null;
  }

  return {
    path: match.path,
    upstreamUrl: match.url,
    sourceFingerprint: createPreviewSourceFingerprint(post.site, match.url),
  };
}

export async function hydratePostVideoSources(
  post: UnifiedPost,
  repository: MediaSourceLookupRepository
): Promise<PostVideoSource[]> {
  const entries = getPostVideoEntries(post);

  return Promise.all(
    entries.map(async (entry) => {
      const sourceFingerprint = createPreviewSourceFingerprint(post.site, entry.url);
      const sourceRecord = await repository.getMediaSourceCache({
        site: post.site,
        sourceFingerprint,
      });
      const localSourceAvailable = post.site === "coomer"
        && Boolean(sourceRecord?.localVideoPath)
        && sourceRecord?.downloadStatus === "source-ready";

      return {
        path: entry.path,
        sourceFingerprint,
        upstreamUrl: entry.url,
        localSourceAvailable,
        sourceCacheStatus: sourceRecord?.downloadStatus ?? null,
        localStreamUrl: localSourceAvailable
          ? buildMediaSourcePublicUrl(post.site, sourceFingerprint)
          : null,
      } satisfies PostVideoSource;
    })
  );
}

