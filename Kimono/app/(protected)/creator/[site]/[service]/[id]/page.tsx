"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MediaCard from "@/components/MediaCard";
import { User, ExternalLink, Loader2, Search } from "lucide-react";
import type { UnifiedPost, Site } from "@/lib/api/unified";
import type { Creator } from "@/lib/api/kemono";
import { getPostThumbnail, getPostType } from "@/lib/api/unified";

type MediaFilter = "tout" | "images" | "videos";

export default function CreatorPage() {
  const params = useParams<{ site: string; service: string; id: string }>();
  const site = params.site as Site;
  const service = params.service;
  const id = params.id;

  // Fix #6: Validation des paramètres
  const isValidSite = site === "kemono" || site === "coomer";
  const isValid = isValidSite && service && id;

  const [profile, setProfile] = useState<(Creator & { site: Site }) | null>(null);
  const [posts, setPosts] = useState<UnifiedPost[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [avatarError, setAvatarError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [knownMaxPage, setKnownMaxPage] = useState(1);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("tout");
  const [postQuery, setPostQuery] = useState("");
  const [allPosts, setAllPosts] = useState<UnifiedPost[] | null>(null);
  const [loadingAllPosts, setLoadingAllPosts] = useState(false);

  const siteBaseUrl =
    site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch(
        `/api/creator-profile?site=${site}&service=${service}&id=${id}`
      );
      const data = await res.json();
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [site, service, id]);

  const fetchPosts = useCallback(
    async (page: number) => {
      setLoadingPosts(true);

      try {
        const currentOffset = (page - 1) * 50;
        const res = await fetch(
          `/api/creator-posts?site=${site}&service=${service}&id=${id}&offset=${currentOffset}`
        );
        const raw = await res.json();
        const data: UnifiedPost[] = Array.isArray(raw) ? raw : [];

        setPosts(data);
        const hasNext = data.length >= 50;
        setHasNextPage(hasNext);
        setCurrentPage(page);
        if (page > knownMaxPage) setKnownMaxPage(page);
        if (hasNext && page >= knownMaxPage) setKnownMaxPage(page + 1);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPosts(false);
      }
    },
    [site, service, id]
  );

  useEffect(() => {
    fetchProfile();
    fetchPosts(1);
  }, [fetchProfile, fetchPosts]);

  // Prefetching to find the max page (up to 10)
  useEffect(() => {
    if (!isValid) return;
    
    let isCancelled = false;

    async function prefetchNextPages() {
      let currentCheckPage = knownMaxPage;
      const targetMaxPage = currentPage + 4;
      
      while (currentCheckPage < targetMaxPage && !isCancelled) {
        try {
          const checkOffset = currentCheckPage * 50;
          const res = await fetch(
            `/api/creator-posts?site=${site}&service=${service}&id=${id}&offset=${checkOffset}`
          );
          const raw = await res.json();
          const pData: UnifiedPost[] = Array.isArray(raw) ? raw : [];
          
          if (pData.length > 0) {
            currentCheckPage++;
            setKnownMaxPage(currentCheckPage);
            if (pData.length < 50) {
              // We found the actual last page
              break;
            }
          } else {
            // Empty page means the previous page was the last
            break;
          }
        } catch (err) {
          console.error("Error prefetching page", currentCheckPage + 1, err);
          break;
        }
      }
    }

    if (hasNextPage && knownMaxPage < currentPage + 4) {
      prefetchNextPages();
    }

    return () => {
      isCancelled = true;
    };
  }, [hasNextPage, knownMaxPage, currentPage, site, service, id, isValid]);

  useEffect(() => {
    if (postQuery.trim() && allPosts === null && !loadingAllPosts) {
      let isCancelled = false;
      const BATCH = 5; // fetch 5 pages in parallel

      async function fetchAllPosts() {
        setLoadingAllPosts(true);
        const all: UnifiedPost[] = [];
        let offset = 0;
        let done = false;

        try {
          while (!done && !isCancelled) {
            const offsets = Array.from({ length: BATCH }, (_, i) => offset + i * 50);
            const results = await Promise.all(
              offsets.map((o) =>
                fetch(`/api/creator-posts?site=${site}&service=${service}&id=${id}&offset=${o}`)
                  .then((r) => r.json())
                  .catch(() => [])
              )
            );

            for (const data of results) {
              if (!Array.isArray(data) || data.length === 0) { done = true; break; }
              all.push(...data);
              if (data.length < 50) { done = true; break; }
            }

            // Progressive update so user sees results as they load
            if (!isCancelled) setAllPosts([...all]);
            offset += BATCH * 50;
          }

          if (!isCancelled) setAllPosts(all);
        } catch (err) {
          console.error("Error fetching all posts", err);
          if (!isCancelled && all.length > 0) setAllPosts(all);
        } finally {
          if (!isCancelled) setLoadingAllPosts(false);
        }
      }

      fetchAllPosts();
      return () => { isCancelled = true; };
    }
  }, [postQuery, allPosts, loadingAllPosts, site, service, id]);

  const basePosts = postQuery.trim() && allPosts !== null ? allPosts : posts;

  const filteredPosts = basePosts.filter((post) => {
    if (mediaFilter === "images" && getPostType(post) !== "image") return false;
    if (mediaFilter === "videos" && getPostType(post) !== "video") return false;
    if (postQuery.trim()) {
      const q = postQuery.trim().toLowerCase();
      const titleMatch = (post.title || "").toLowerCase().includes(q);
      const contentMatch = (post.content || "").toLowerCase().includes(q);
      if (!titleMatch && !contentMatch) return false;
    }
    return true;
  });

  // Reset page when postQuery changes
  useEffect(() => {
    setCurrentPage(1);
  }, [postQuery]);

  const displayName =
    profile?.name ?? (loadingProfile ? "…" : `Créateur ${id}`);

  if (!isValid) {
    return (
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center space-y-2">
        <p className="text-red-400 text-lg font-medium">Paramètres invalides</p>
        <p className="text-[#6b7280] text-sm">
          Le site doit être « kemono » ou « coomer », et le service/ID ne peuvent pas être vides.
        </p>
      </div>
    );
  }

  const goToPage = (page: number) => {
    fetchPosts(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function Pagination() {
    const pages = [];
    const maxVisiblePage = Math.max(currentPage, knownMaxPage);

    // Always show 1
    pages.push(1);

    // Show dots or pages between 1 and currentPage-1
    if (currentPage > 3) {
      pages.push("...");
      pages.push(currentPage - 1);
    } else if (currentPage > 2) {
      pages.push(2);
    }

    // Show currentPage (if > 1)
    if (currentPage > 1) {
      pages.push(currentPage);
    }

    // Show pages up to maxVisiblePage
    let nextP = currentPage + 1;
    while (nextP <= maxVisiblePage) {
      if (nextP === maxVisiblePage && maxVisiblePage > currentPage + 2) {
        pages.push("...");
        pages.push(maxVisiblePage);
        break;
      }
      pages.push(nextP);
      nextP++;
    }

    return (
      <div className="flex items-center justify-center gap-1 pt-4 flex-wrap">
        {currentPage > 1 && (
          <button onClick={() => goToPage(1)} className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center">
            «
          </button>
        )}
        {currentPage > 1 && (
          <button onClick={() => goToPage(currentPage - 1)} className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center">
            ‹
          </button>
        )}
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-2 text-[#6b7280]">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goToPage(p as number)}
              className={`w-9 h-9 rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-center ${
                p === currentPage
                  ? "bg-[#7c3aed] text-white"
                  : "border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
            >
              {p}
            </button>
          )
        )}
        {hasNextPage && (
          <button onClick={() => goToPage(currentPage + 1)} className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center">
            ›
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête créateur */}
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-[#7c3aed]/20 flex items-center justify-center shrink-0 overflow-hidden">
            {loadingProfile ? (
              <Loader2 className="h-7 w-7 animate-spin text-[#7c3aed]" />
            ) : !avatarError ? (
              <img
                src={`${site === "kemono" ? "https://img.kemono.cr" : "https://img.coomer.st"}/icons/${service}/${id}`}
                alt={displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-8 w-8 text-[#7c3aed]" />
            )}
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[#f0f0f5] truncate">
                {displayName}
              </h1>
              <Badge
                className={
                  site === "kemono"
                    ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                    : "bg-pink-600/20 text-pink-400"
                }
              >
                {site}
              </Badge>
              <Badge
                variant="outline"
                className="border-[#1e1e2e] text-[#6b7280]"
              >
                {service}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-[#6b7280] text-sm">
              <ExternalLink className="h-3 w-3 shrink-0" />
              <a
                href={`${siteBaseUrl}/${service}/user/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#7c3aed] transition-colors truncate"
              >
                {siteBaseUrl}/{service}/user/{id}
              </a>
            </div>

            {profile && (profile.favorited !== undefined || profile.updated !== undefined || profile.indexed !== undefined) && (
              <div className="flex gap-4 text-xs text-[#6b7280]">
                {profile.favorited !== undefined && (
                  <span>❤ {profile.favorited.toLocaleString()} favoris</span>
                )}
                {(profile.updated !== undefined || profile.indexed !== undefined) && (
                  <span>
                    Mis à jour le{" "}
                    {new Date((profile.updated ?? profile.indexed ?? 0) * 1000).toLocaleDateString(
                      "fr-FR"
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filtres médias */}
      <div className="flex gap-2">
        {(["tout", "images", "videos"] as MediaFilter[]).map((f) => (
          <Button
            key={f}
            variant="outline"
            size="sm"
            onClick={() => setMediaFilter(f)}
            className={`border-[#1e1e2e] cursor-pointer transition-colors ${
              mediaFilter === f
                ? "bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]"
                : "text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Recherche dans les posts */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
          <Input
            value={postQuery}
            onChange={(e) => setPostQuery(e.target.value)}
            placeholder="Chercher dans les posts…"
            className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] pl-9"
          />
        </div>
        {loadingAllPosts ? (
          <div className="flex items-center text-xs text-[#7c3aed]">
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            Chargement de tous les posts…
          </div>
        ) : postQuery.trim() && allPosts !== null ? (
          <p className="text-xs text-[#6b7280]">
            {filteredPosts.length} post{filteredPosts.length > 1 ? "s" : ""} trouvé{filteredPosts.length > 1 ? "s" : ""} sur {allPosts.length} au total
          </p>
        ) : postQuery.trim() ? (
          <p className="text-xs text-[#6b7280]">
            {filteredPosts.length} post{filteredPosts.length > 1 ? "s" : ""} trouvé{filteredPosts.length > 1 ? "s" : ""}
          </p>
        ) : null}
      </div>

      {/* Grille de posts */}
      {loadingPosts && !postQuery.trim() ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-[#12121a] border border-[#1e1e2e] aspect-video animate-pulse"
            />
          ))}
        </div>
      ) : filteredPosts.length === 0 && !loadingAllPosts ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
          <p className="text-[#6b7280] text-lg">Aucun post disponible.</p>
        </div>
      ) : (
        <>
          {!postQuery.trim() && (
            <div className="pb-4">
              <Pagination />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredPosts.map((post) => (
              <MediaCard
                key={`${post.site}-${post.service}-${post.id}`}
                title={post.title}
                thumbnailUrl={getPostThumbnail(post)}
                type={getPostType(post)}
                site={post.site}
                service={post.service}
                postId={post.id}
                user={post.user}
                publishedAt={post.published}
              />
            ))}
          </div>

          {!postQuery.trim() && <Pagination />}
        </>
      )}

    </div>
  );
}
