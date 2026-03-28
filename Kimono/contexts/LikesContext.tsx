"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Site } from "@/lib/api/helpers";
import {
  deleteBrowserCacheValue,
  fetchJsonWithBrowserCache,
  getDefaultBrowserDataCache,
} from "@/lib/browser-data-cache";
import {
  extractCreatorLikeItems,
  extractPostLikeItems,
  makeCreatorLikeKey,
  makePostLikeKey,
  type LikesCreatorsPayloadLike,
  type LikesPostsPayloadLike,
} from "@/lib/likes-context-utils";

interface LikesContextType {
  likedCreators: Set<string>;
  likedCreatorsOrder: Map<string, number>;
  likedPosts: Set<string>;
  toggleCreatorLike: (site: Site, service: string, id: string) => Promise<void>;
  togglePostLike: (site: Site, service: string, creatorId: string, id: string) => Promise<void>;
  isCreatorLiked: (site: Site, service: string, id: string) => boolean;
  isPostLiked: (site: Site, service: string, creatorId: string, id: string) => boolean;
  refreshLikes: () => Promise<void>;
  loading: boolean;
}

const LikesContext = createContext<LikesContextType | null>(null);
const LIKES_CACHE_TTL_MS = 30_000;

function getCreatorLikesCacheKey(site: Site): string {
  return `likes:creators:${site}`;
}

function getPostLikesCacheKey(site: Site): string {
  return `likes:posts:${site}`;
}

function clearLikesCacheForSite(site: Site) {
  const cache = getDefaultBrowserDataCache();
  deleteBrowserCacheValue(cache, getCreatorLikesCacheKey(site));
  deleteBrowserCacheValue(cache, getPostLikesCacheKey(site));
}

export function LikesProvider({ children }: { children: ReactNode }) {
  const [likedCreators, setLikedCreators] = useState<Set<string>>(new Set());
  const [likedCreatorsOrder, setLikedCreatorsOrder] = useState<Map<string, number>>(new Map());
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchLikes = useCallback(async () => {
    setLoading(true);
    try {
      const [kCreators, cCreators, kPosts, cPosts] = await Promise.allSettled([
        fetchJsonWithBrowserCache<LikesCreatorsPayloadLike>({
          key: getCreatorLikesCacheKey("kemono"),
          ttlMs: LIKES_CACHE_TTL_MS,
          loader: async () => {
            const response = await fetch("/api/favorites?site=kemono");
            return response.json() as Promise<LikesCreatorsPayloadLike>;
          },
        }),
        fetchJsonWithBrowserCache<LikesCreatorsPayloadLike>({
          key: getCreatorLikesCacheKey("coomer"),
          ttlMs: LIKES_CACHE_TTL_MS,
          loader: async () => {
            const response = await fetch("/api/favorites?site=coomer");
            return response.json() as Promise<LikesCreatorsPayloadLike>;
          },
        }),
        fetchJsonWithBrowserCache<LikesPostsPayloadLike>({
          key: getPostLikesCacheKey("kemono"),
          ttlMs: LIKES_CACHE_TTL_MS,
          loader: async () => {
            const response = await fetch("/api/favorites?site=kemono");
            return response.json() as Promise<LikesPostsPayloadLike>;
          },
        }),
        fetchJsonWithBrowserCache<LikesPostsPayloadLike>({
          key: getPostLikesCacheKey("coomer"),
          ttlMs: LIKES_CACHE_TTL_MS,
          loader: async () => {
            const response = await fetch("/api/favorites?site=coomer");
            return response.json() as Promise<LikesPostsPayloadLike>;
          },
        }),
      ]);

      const creators = new Set<string>();
      const creatorsOrder = new Map<string, number>();
      const posts = new Set<string>();

      for (const [result, site] of [
        [kCreators, "kemono"],
        [cCreators, "coomer"],
      ] as const) {
        if (result.status !== "fulfilled") {
          continue;
        }

        const payload = result.value;
        const items = extractCreatorLikeItems(payload);
        if (payload?.expired && items.length === 0) {
          continue;
        }

        for (const creator of items) {
          if (!creator?.id || !creator?.service) {
            continue;
          }

          const key = makeCreatorLikeKey(site, String(creator.service), String(creator.id));
          creators.add(key);
          creatorsOrder.set(key, creator.favoriteSourceIndex ?? creatorsOrder.size);
        }
      }

      for (const [result, site] of [
        [kPosts, "kemono"],
        [cPosts, "coomer"],
      ] as const) {
        if (result.status !== "fulfilled") {
          continue;
        }

        const payload = result.value;
        const items = extractPostLikeItems(payload);
        if (payload?.expired && items.length === 0) {
          continue;
        }

        for (const post of items) {
          if (!post?.id || !post?.service) {
            continue;
          }

          const creatorId = String(post.user ?? post.creatorId ?? "");
          posts.add(makePostLikeKey(site, String(post.service), creatorId, String(post.id)));
        }
      }

      setLikedCreators(creators);
      setLikedCreatorsOrder(creatorsOrder);
      setLikedPosts(posts);
    } catch (err) {
      console.error("Failed to fetch likes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLikes();
  }, [fetchLikes]);

  const toggleCreatorLike = useCallback(
    async (site: Site, service: string, id: string) => {
      const key = makeCreatorLikeKey(site, service, id);
      const wasLiked = likedCreators.has(key);
      const previousOrder = likedCreatorsOrder.get(key);

      setLikedCreators((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(key);
        else next.add(key);
        return next;
      });
      setLikedCreatorsOrder((prev) => {
        const next = new Map(prev);
        if (wasLiked) next.delete(key);
        else next.set(key, -1);
        return next;
      });

      try {
        const method = wasLiked ? "DELETE" : "POST";
        const res = await fetch(`/api/favorites/creators/${site}/${service}/${id}`, {
          method,
        });
        if (!res.ok) throw new Error("API error");
        clearLikesCacheForSite(site);
      } catch {
        setLikedCreators((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(key);
          else next.delete(key);
          return next;
        });
        setLikedCreatorsOrder((prev) => {
          const next = new Map(prev);
          if (wasLiked) {
            if (previousOrder != null) {
              next.set(key, previousOrder);
            } else {
              next.delete(key);
            }
          } else {
            next.delete(key);
          }
          return next;
        });
      }
    },
    [likedCreators, likedCreatorsOrder]
  );

  const togglePostLike = useCallback(
    async (site: Site, service: string, creatorId: string, id: string) => {
      const key = makePostLikeKey(site, service, creatorId, id);
      const wasLiked = likedPosts.has(key);

      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(key);
        else next.add(key);
        return next;
      });

      try {
        const method = wasLiked ? "DELETE" : "POST";
        const res = await fetch(`/api/favorites/posts/${site}/${service}/${creatorId}/${id}`, {
          method,
        });
        if (!res.ok) throw new Error("API error");
        clearLikesCacheForSite(site);
      } catch {
        setLikedPosts((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(key);
          else next.delete(key);
          return next;
        });
      }
    },
    [likedPosts]
  );

  const isCreatorLiked = useCallback(
    (site: Site, service: string, id: string) =>
      likedCreators.has(makeCreatorLikeKey(site, service, id)),
    [likedCreators]
  );

  const isPostLiked = useCallback(
    (site: Site, service: string, creatorId: string, id: string) =>
      likedPosts.has(makePostLikeKey(site, service, creatorId, id)),
    [likedPosts]
  );

  return (
    <LikesContext.Provider
      value={{
        likedCreators,
        likedCreatorsOrder,
        likedPosts,
        toggleCreatorLike,
        togglePostLike,
        isCreatorLiked,
        isPostLiked,
        refreshLikes: fetchLikes,
        loading,
      }}
    >
      {children}
    </LikesContext.Provider>
  );
}

export function useLikes() {
  const ctx = useContext(LikesContext);
  if (!ctx) throw new Error("useLikes must be used within LikesProvider");
  return ctx;
}
