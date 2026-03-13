"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MediaCard from "@/components/MediaCard";
import CreatorCard from "@/components/CreatorCard";
import { useLikes } from "@/contexts/LikesContext";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { getPostType, proxyCdnUrl, resolvePostMedia } from "@/lib/api/helpers";
import { fetchJsonWithBrowserCache } from "@/lib/browser-data-cache";
import {
  BROWSER_POST_CACHE_TTL_MS,
  buildCreatorPostsCacheKey,
  buildCreatorProfileCacheKey,
} from "@/lib/perf-cache";
import type { UnifiedPost, Site } from "@/lib/api/helpers";
import type { Creator } from "@/lib/api/kemono";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ExternalLink,
  FileText,
  Heart,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Search,
  User,
  Users,
} from "lucide-react";

interface RecommendedCreator {
  id: string;
  service: string;
  name: string;
  indexed: string;
  updated: string;
  public_id: string | null;
  relation_id: number | null;
}

type MediaFilter = "tout" | "images" | "videos";

export default function CreatorPage() {
  const params = useParams<{ site: string; service: string; id: string }>();
  const site = params.site as Site;
  const service = params.service;
  const id = params.id;

  const isValidSite = site === "kemono" || site === "coomer";
  const isValid = isValidSite && service && id;

  const [profile, setProfile] = useState<(Creator & { site: Site }) | null>(null);
  const [posts, setPosts] = useState<UnifiedPost[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [recommended, setRecommended] = useState<RecommendedCreator[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [avatarError, setAvatarError] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { isCreatorLiked, toggleCreatorLike } = useLikes();
  const liked = isCreatorLiked(site, service, id);

  const query = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const [inputValue, setInputValue] = useState(query);
  const [knownMaxPage, setKnownMaxPage] = useState(Math.max(1, page));
  const mediaFilter = (searchParams.get("media") as MediaFilter) || "tout";
  const activeTab = (searchParams.get("tab") as "posts" | "recommended") || "posts";

  const creatorPageKey = `${site}-${service}-${id}`;
  const recommendedCacheKey = `creator:recommended:${site}:${service}:${id}`;
  const isDataReady = !loadingPosts && !loadingProfile;
  useScrollRestoration(creatorPageKey, isDataReady);

  const handleTabChange = (tab: "posts" | "recommended") => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (tab === "posts") nextParams.delete("tab");
    else nextParams.set("tab", tab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const handleMediaFilterChange = (media: MediaFilter) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (media === "tout") nextParams.delete("media");
    else nextParams.set("media", media);
    nextParams.delete("page");
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const [searchResults, setSearchResults] = useState<UnifiedPost[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);

  const updateURL = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (nextQuery: string, nextPage: number) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (nextQuery) nextParams.set("q", nextQuery);
        else nextParams.delete("q");
        if (nextPage > 1) nextParams.set("page", String(nextPage));
        else nextParams.delete("page");
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      }, 300);
    };
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  const siteBaseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const data = await fetchJsonWithBrowserCache<(Creator & { site: Site }) | null>({
        key: buildCreatorProfileCacheKey({ site, service, creatorId: id }),
        ttlMs: BROWSER_POST_CACHE_TTL_MS,
        loader: async () => {
          const response = await fetch(`/api/creator-profile?site=${site}&service=${service}&id=${id}`);
          return response.ok ? response.json() : null;
        },
      });
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [id, service, site]);

  const fetchPosts = useCallback(
    async (nextPage: number) => {
      setLoadingPosts(true);

      try {
        const currentOffset = (nextPage - 1) * 50;
        const data = await fetchJsonWithBrowserCache<UnifiedPost[]>({
          key: buildCreatorPostsCacheKey({
            site,
            service,
            creatorId: id,
            offset: currentOffset,
          }),
          ttlMs: BROWSER_POST_CACHE_TTL_MS,
          loader: async () => {
            const response = await fetch(
              `/api/creator-posts?site=${site}&service=${service}&id=${id}&offset=${currentOffset}`
            );
            const raw = await response.json();
            return Array.isArray(raw) ? raw : [];
          },
        });

        setPosts(data);
        const hasNext = data.length >= 50;
        setHasNextPage(hasNext);
        if (nextPage > knownMaxPage) setKnownMaxPage(nextPage);
        if (hasNext && nextPage >= knownMaxPage) setKnownMaxPage(nextPage + 1);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingPosts(false);
      }
    },
    [id, knownMaxPage, service, site]
  );

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    let active = true;
    setLoadingRecommended(true);

    fetchJsonWithBrowserCache<RecommendedCreator[]>({
      key: recommendedCacheKey,
      ttlMs: BROWSER_POST_CACHE_TTL_MS,
      loader: async () => {
        const response = await fetch(`/api/recommended?site=${site}&service=${service}&id=${id}`);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      },
    })
      .then((data) => {
        if (active) {
          setRecommended(data);
          setLoadingRecommended(false);
        }
      })
      .catch(() => {
        if (active) {
          setRecommended([]);
          setLoadingRecommended(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id, recommendedCacheKey, service, site]);

  useEffect(() => {
    if (!query) {
      void fetchPosts(page);
    }
  }, [fetchPosts, page, query]);

  useEffect(() => {
    if (!query) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    let cancelled = false;
    setLoadingSearch(true);

    void (async () => {
      const all: UnifiedPost[] = [];
      let offset = 0;

      while (true) {
        try {
          const data = await fetchJsonWithBrowserCache<UnifiedPost[]>({
            key: buildCreatorPostsCacheKey({
              site,
              service,
              creatorId: id,
              offset,
              q: query,
            }),
            ttlMs: BROWSER_POST_CACHE_TTL_MS,
            loader: async () => {
              const response = await fetch(
                `/api/creator-posts?site=${site}&service=${service}&id=${id}&offset=${offset}&q=${encodeURIComponent(query)}`
              );
              const json = await response.json();
              return Array.isArray(json) ? json : [];
            },
          });
          if (cancelled) return;
          if (!Array.isArray(data) || data.length === 0) break;
          all.push(...data);
          if (data.length < 50) break;
          offset += 50;
        } catch {
          break;
        }
      }

      if (!cancelled) {
        setSearchResults(all);
        setLoadingSearch(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, query, service, site]);

  useEffect(() => {
    setSearchResults([]);
  }, [id, service, site]);

  const isSearching = query.length > 0;
  const basePosts = isSearching ? searchResults : posts;

  const filteredPosts = basePosts.filter((post) => {
    if (mediaFilter === "images" && getPostType(post) !== "image") return false;
    if (mediaFilter === "videos" && getPostType(post) !== "video") return false;

    if (isSearching) {
      const loweredQuery = query.toLowerCase();
      const inTitle = (post.title || "").toLowerCase().includes(loweredQuery);
      const inContent = (post.content || "").toLowerCase().includes(loweredQuery);
      if (!inTitle && !inContent) {
        return false;
      }
    }

    return true;
  });

  const displayName = profile?.name ?? (loadingProfile ? "..." : `Créateur ${id}`);

  if (!isValid) {
    return (
      <div className="space-y-2 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
        <p className="text-lg font-medium text-red-400">Paramètres invalides</p>
        <p className="text-sm text-[#6b7280]">
          Le site doit être "kemono" ou "coomer", et le service comme l'identifiant ne peuvent pas être vides.
        </p>
      </div>
    );
  }

  const goToPage = (nextPage: number) => {
    updateURL(query, nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function Pagination() {
    const pages: Array<number | "..."> = [];
    const maxVisiblePage = Math.max(page, knownMaxPage);

    pages.push(1);

    if (page > 3) {
      pages.push("...");
      pages.push(page - 1);
    } else if (page > 2) {
      pages.push(2);
    }

    if (page > 1) {
      pages.push(page);
    }

    let nextPage = page + 1;
    while (nextPage <= maxVisiblePage) {
      if (nextPage === maxVisiblePage && maxVisiblePage > page + 2) {
        pages.push("...");
        pages.push(maxVisiblePage);
        break;
      }
      pages.push(nextPage);
      nextPage += 1;
    }

    return (
      <div className="flex flex-wrap items-center justify-center gap-1 pt-4">
        {page > 1 && (
          <button
            aria-label="Première page"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#1e1e2e] text-[#6b7280] transition-colors hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            onClick={() => goToPage(1)}
            title="Première page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
        {page > 1 && (
          <button
            aria-label="Page précédente"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#1e1e2e] text-[#6b7280] transition-colors hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            onClick={() => goToPage(page - 1)}
            title="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {pages.map((value, index) =>
          value === "..." ? (
            <span key={`dots-${index}`} className="flex h-9 w-9 items-center justify-center text-[#6b7280]">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          ) : (
            <button
              key={`page-${value}`}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sm transition-colors ${
                value === page
                  ? "bg-[#7c3aed] text-white"
                  : "border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
              onClick={() => goToPage(value as number)}
            >
              {value}
            </button>
          )
        )}
        {hasNextPage && (
          <button
            aria-label="Page suivante"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#1e1e2e] text-[#6b7280] transition-colors hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            onClick={() => goToPage(page + 1)}
            title="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7c3aed]/20">
            {loadingProfile ? (
              <Loader2 className="h-7 w-7 animate-spin text-[#7c3aed]" />
            ) : !avatarError ? (
              <img
                src={proxyCdnUrl(site, `/icons/${service}/${id}`)}
                alt={displayName}
                onError={() => setAvatarError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-8 w-8 text-[#7c3aed]" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-[#f0f0f5]">{displayName}</h1>
              <Badge
                className={
                  site === "kemono"
                    ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                    : "bg-pink-600/20 text-pink-400"
                }
              >
                {site}
              </Badge>
              <Badge variant="outline" className="border-[#1e1e2e] text-[#6b7280]">
                {service}
              </Badge>
              <button
                onClick={() => void toggleCreatorLike(site, service, id)}
                className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-[#1e1e2e] bg-[#1e1e2e]/50 px-3 py-1.5 text-sm transition-colors hover:bg-[#1e1e2e]"
              >
                <Heart
                  className={`h-4 w-4 transition-colors ${
                    liked ? "fill-red-500 text-red-500" : "text-[#6b7280] group-hover:text-red-400"
                  }`}
                />
                <span className={liked ? "font-medium text-red-500" : "text-[#6b7280]"}>
                  {liked ? "Abonné" : "S'abonner"}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm text-[#6b7280]">
              <ExternalLink className="h-3 w-3 shrink-0" />
              <a
                href={`${siteBaseUrl}/${service}/user/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate transition-colors hover:text-[#7c3aed]"
              >
                {siteBaseUrl}/{service}/user/{id}
              </a>
            </div>

            {profile && (
              <div className="flex flex-wrap gap-4 text-xs text-[#6b7280]">
                {profile.post_count !== undefined && (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#7c3aed]" />
                    <span>{profile.post_count.toLocaleString()} posts</span>
                  </span>
                )}
                {profile.favorited !== undefined && (
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-pink-400" />
                    <span>{profile.favorited.toLocaleString()} favoris</span>
                  </span>
                )}
                {(profile.updated !== undefined || profile.indexed !== undefined) && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-[#7c3aed]" />
                    <span>
                      Mis à jour le {new Date(profile.updated ?? profile.indexed ?? 0).toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-full max-w-sm gap-1 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-1">
        <button
          onClick={() => handleTabChange("posts")}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            activeTab === "posts"
              ? "bg-[#1e1e2e] text-[#f0f0f5] shadow-sm"
              : "text-[#6b7280] hover:text-[#f0f0f5]"
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Posts
          {profile?.post_count !== undefined && (
            <Badge variant="secondary" className="ml-1 h-4 bg-[#7c3aed]/20 px-1.5 py-0 text-[10px] text-[#7c3aed]">
              {profile.post_count > 999 ? "999+" : profile.post_count}
            </Badge>
          )}
        </button>
        <button
          onClick={() => handleTabChange("recommended")}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            activeTab === "recommended"
              ? "bg-[#1e1e2e] text-[#f0f0f5] shadow-sm"
              : "text-[#6b7280] hover:text-[#f0f0f5]"
          }`}
        >
          <Users className="h-4 w-4" />
          Similaires
        </button>
      </div>

      {activeTab === "posts" ? (
        <>
          <div className="flex gap-2">
            {(["tout", "images", "videos"] as MediaFilter[]).map((value) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => handleMediaFilterChange(value)}
                className={`cursor-pointer border-[#1e1e2e] transition-colors ${
                  mediaFilter === value
                    ? "border-[#7c3aed] bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <Input
                value={inputValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setInputValue(nextValue);
                  updateURL(nextValue, 1);
                }}
                placeholder="Chercher dans les posts..."
                className="border-[#1e1e2e] bg-[#12121a] pl-9 text-[#f0f0f5] placeholder:text-[#6b7280]"
              />
            </div>
            {loadingSearch && isSearching ? (
              <div className="flex items-center text-xs text-[#7c3aed]">
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Recherche en cours...
              </div>
            ) : isSearching ? (
              <p className="text-xs text-[#6b7280]">
                {filteredPosts.length} post{filteredPosts.length > 1 ? "s" : ""} trouvé
                {filteredPosts.length > 1 ? "s" : ""}
              </p>
            ) : null}
          </div>

          {(loadingPosts && !isSearching) || (loadingSearch && isSearching) ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 18 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-square animate-pulse rounded-xl border border-[#1e1e2e] bg-[#12121a]"
                />
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
              <p className="text-lg text-[#6b7280]">
                {isSearching ? "Aucun post trouvé pour cette recherche." : "Aucun post disponible."}
              </p>
            </div>
          ) : (
            <>
              {!isSearching && !loadingPosts && (knownMaxPage > 1 || page > 1) && (
                <div className="pb-4">
                  <Pagination />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredPosts.map((post) => {
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
                    />
                  );
                })}
              </div>

              {!isSearching && !loadingPosts && (knownMaxPage > 1 || page > 1) && (
                <div className="pt-4">
                  <Pagination />
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="pt-2">
          {loadingRecommended ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[4/5] animate-pulse rounded-xl border border-[#1e1e2e] bg-[#12121a]"
                />
              ))}
            </div>
          ) : recommended.length === 0 ? (
            <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
              <p className="text-sm text-[#6b7280]">Aucun créateur similaire trouvé.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {recommended.map((creator) => (
                <CreatorCard
                  key={`${creator.service}-${creator.id}`}
                  id={creator.id}
                  name={creator.name}
                  service={creator.service}
                  site={site}
                  updated={creator.updated}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}