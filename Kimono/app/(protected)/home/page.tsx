"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import { Button } from "@/components/ui/button";
import type { UnifiedPost } from "@/lib/api/helpers";
import { resolvePostMedia } from "@/lib/api/helpers";

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#12121a] animate-pulse">
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
      const response = await fetch(`/api/recent-posts?offset=${currentOffset}`);
      const data: UnifiedPost[] = await response.json();

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
    fetchPosts(0);
  }, [fetchPosts]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Recents</h1>
        <p className="text-sm text-[#6b7280]">
          Les derniers posts publies sur Kemono et Coomer.
        </p>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
          <p className="text-[#6b7280]">Aucun post disponible pour le moment.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {posts.map((post) => {
              const media = resolvePostMedia(post);

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
                  videoPreviewMode="viewport"
                />
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={() => fetchPosts(offset)}
                disabled={loadingMore}
                className="cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  "Voir plus"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}