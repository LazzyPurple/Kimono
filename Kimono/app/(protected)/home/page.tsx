"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import { Button } from "@/components/ui/button";
import type { UnifiedPost } from "@/lib/api/helpers";
import { resolveListingPostMedia } from "@/lib/api/helpers";
import { fetchJsonWithBrowserCache } from "@/lib/browser-data-cache";
import { BROWSER_POST_CACHE_TTL_MS } from "@/lib/db/performance-cache";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { buildAppPageTitle } from "@/lib/page-titles";

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="animate-pulse overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#12121a]">
          <div className="aspect-video bg-[#1e1e2e]" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-full rounded bg-[#1e1e2e]" />
            <div className="h-3 w-2/3 rounded bg-[#1e1e2e]" />
            <div className="h-2.5 w-1/3 rounded bg-[#1e1e2e]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  useDocumentTitle(buildAppPageTitle("Recent"));

  const [posts, setPosts] = useState<UnifiedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchPosts = useCallback(async (currentOffset: number) => {
    if (currentOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const data = await fetchJsonWithBrowserCache<UnifiedPost[]>({
        key: `recent-posts:${currentOffset}`,
        ttlMs: BROWSER_POST_CACHE_TTL_MS,
        loader: async () => {
          const response = await fetch(`/api/posts/recent?offset=${currentOffset}`);
          if (!response.ok) {
            throw new Error("Failed to load recent posts.");
          }
          return response.json() as Promise<UnifiedPost[]>;
        },
      });

      if (currentOffset === 0) {
        setPosts(data);
      } else {
        setPosts((previous) => [...previous, ...data]);
      }

      setHasMore(data.length >= 50);
      setOffset(currentOffset + 50);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchPosts(0);
  }, [fetchPosts]);

  const showInitialSkeleton = loading && posts.length === 0;
  const showRefreshingState = loading && posts.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Recent</h1>
        <p className="text-sm text-[#6b7280]">The latest posts published on Kemono and Coomer.</p>
      </div>

      {showInitialSkeleton ? (
        <SkeletonGrid />
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
          <p className="text-[#6b7280]">No posts are available right now.</p>
        </div>
      ) : (
        <>
          {showRefreshingState && (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1e1e2e] bg-[#12121a] px-3 py-1 text-xs text-[#6b7280]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7c3aed]" />
              Refreshing recent posts...
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {posts.map((post, index) => {
              const media = resolveListingPostMedia(post);

              return (
                <MediaCard
                  key={`${post.site}-${post.service}-${post.id}`}
                  title={post.title}
                  previewImageUrl={media.previewImageUrl}
                  videoUrl={media.videoUrl}
                  type={media.type}
                  site={post.site}
                  service={post.service}
                  postId={post.id}
                  user={post.user}
                  publishedAt={post.published}
                  priority={index < 4}
                  durationSeconds={media.durationSeconds}
                  mediaWidth={media.width}
                  mediaHeight={media.height}
                  mediaMimeType={media.mimeType}
                  videoPreviewMode="viewport"
                  videoCandidates={media.videoCandidates}
                />
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={() => void fetchPosts(offset)}
                disabled={loadingMore}
                className="cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}



