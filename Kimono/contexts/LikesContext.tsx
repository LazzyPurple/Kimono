"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Site } from "@/lib/api/unified";

interface LikesContextType {
  likedCreators: Set<string>;
  likedCreatorsOrder: Map<string, number>;
  likedPosts: Set<string>;
  toggleCreatorLike: (site: Site, service: string, id: string) => Promise<void>;
  togglePostLike: (site: Site, service: string, creatorId: string, id: string) => Promise<void>;
  isCreatorLiked: (site: Site, service: string, id: string) => boolean;
  isPostLiked: (site: Site, service: string, id: string) => boolean;
  refreshLikes: () => Promise<void>;
  loading: boolean;
}

const LikesContext = createContext<LikesContextType | null>(null);

function makeKey(site: string, service: string, id: string) {
  return `${site}-${service}-${id}`;
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
        fetch("/api/likes/creators?site=kemono").then((r) => r.json()),
        fetch("/api/likes/creators?site=coomer").then((r) => r.json()),
        fetch("/api/likes/posts?site=kemono").then((r) => r.json()),
        fetch("/api/likes/posts?site=coomer").then((r) => r.json()),
      ]);

      const creators = new Set<string>();
      const creatorsOrder = new Map<string, number>();
      const posts = new Set<string>();

      for (const [result, site] of [
        [kCreators, "kemono"],
        [cCreators, "coomer"],
      ] as const) {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
          let index = 0;
          for (const c of result.value) {
            const key = makeKey(site, c.service, c.id);
            creators.add(key);
            creatorsOrder.set(key, index++);
          }
        }
      }

      for (const [result, site] of [
        [kPosts, "kemono"],
        [cPosts, "coomer"],
      ] as const) {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
          for (const p of result.value) {
            posts.add(makeKey(site, p.service, p.id));
          }
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
    fetchLikes();
  }, [fetchLikes]);

  const toggleCreatorLike = useCallback(
    async (site: Site, service: string, id: string) => {
      const key = makeKey(site, service, id);
      const wasLiked = likedCreators.has(key);

      // Optimistic update
      setLikedCreators((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(key);
        else next.add(key);
        return next;
      });
      setLikedCreatorsOrder((prev) => {
        const next = new Map(prev);
        if (wasLiked) next.delete(key);
        else next.set(key, -1); // -1 makes it the absolute newest favorite
        return next;
      });

      try {
        const method = wasLiked ? "DELETE" : "POST";
        const res = await fetch("/api/likes/creators", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site, service, creatorId: id }),
        });
        if (!res.ok) throw new Error("API error");
      } catch {
        // Rollback
        setLikedCreators((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(key);
          else next.delete(key);
          return next;
        });
        setLikedCreatorsOrder((prev) => {
           // We can't perfectly restore its original index if it was deleted, but reloading will fix it.
           const next = new Map(prev);
           if (wasLiked) next.set(key, 0);
           else next.delete(key);
           return next;
        });
      }
    },
    [likedCreators]
  );

  const togglePostLike = useCallback(
    async (site: Site, service: string, creatorId: string, id: string) => {
      const key = makeKey(site, service, id);
      const wasLiked = likedPosts.has(key);

      // Optimistic update
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(key);
        else next.add(key);
        return next;
      });

      try {
        const method = wasLiked ? "DELETE" : "POST";
        const res = await fetch("/api/likes/posts", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site, service, creatorId, postId: id }),
        });
        if (!res.ok) throw new Error("API error");
      } catch {
        // Rollback
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
      likedCreators.has(makeKey(site, service, id)),
    [likedCreators]
  );

  const isPostLiked = useCallback(
    (site: Site, service: string, id: string) =>
      likedPosts.has(makeKey(site, service, id)),
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
