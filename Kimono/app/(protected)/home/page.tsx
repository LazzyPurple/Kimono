"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import MediaCard from "@/components/MediaCard";
import { Loader2 } from "lucide-react";
import type { UnifiedPost } from "@/lib/api/unified";
import { getPostThumbnail, getPostType, getPostVideoThumbnailUrl } from "@/lib/api/unified";

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[#12121a] border border-[#1e1e2e] overflow-hidden animate-pulse">
          <div className="aspect-video bg-[#1e1e2e]" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-[#1e1e2e] rounded w-full" />
            <div className="h-3 bg-[#1e1e2e] rounded w-2/3" />
            <div className="h-2.5 bg-[#1e1e2e] rounded w-1/3" />
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
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`/api/recent-posts?offset=${currentOffset}`);
      const data: UnifiedPost[] = await res.json();

      if (currentOffset === 0) {
        setPosts(data);
      } else {
        setPosts((prev) => [...prev, ...data]);
      }

      setHasMore(data.length >= 50);
      setOffset(currentOffset + 50);
    } catch (err) {
      console.error(err);
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
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Récents</h1>
        <p className="text-sm text-[#6b7280]">
          Les derniers posts publiés sur Kemono et Coomer.
        </p>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : posts.length === 0 ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
          <p className="text-[#6b7280]">Aucun post disponible pour le moment.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {posts.map((post) => (
              <MediaCard
                key={`${post.site}-${post.service}-${post.id}`}
                title={post.title}
                thumbnailUrl={getPostThumbnail(post)}
                videoThumbnailUrl={getPostVideoThumbnailUrl(post)}
                type={getPostType(post)}
                site={post.site}
                service={post.service}
                postId={post.id}
                user={post.user}
                publishedAt={post.published}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={() => fetchPosts(offset)}
                disabled={loadingMore}
                className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Chargement…
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
