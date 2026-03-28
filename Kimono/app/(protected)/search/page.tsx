"use client";

import { Suspense, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreatorCard from "@/components/CreatorCard";
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { fetchJsonWithBrowserCache } from "@/lib/browser-data-cache";
import { buildSearchCacheKey, type SearchFilter, type SearchSort } from "@/lib/db/performance-cache";
import { buildSearchPageTitle } from "@/lib/page-titles";
import { shouldCacheSearchResponse } from "@/lib/search-response-cache";
import type { UnifiedCreator } from "@/lib/api/helpers";
import { Heart, Loader2, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PER_PAGE = 50;
const SEARCH_BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;

interface SearchApiResponse {
  items: UnifiedCreator[];
  total: number;
  page: number;
  perPage: number;
  services: string[];
  syncedAt: string | null;
  source: string;
}

function SearchPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filter = (searchParams.get("filter") as SearchFilter) ?? "tous";
  const sortBy = (searchParams.get("sort") as SearchSort) ?? "favorites";
  const serviceFilter = searchParams.get("service") ?? "Tous";
  const currentPage = Number(searchParams.get("page") ?? "1");
  const qParam = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(qParam);
  const [resultPage, setResultPage] = useState<SearchApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { likedCreators } = useLikes();

  useDocumentTitle(buildSearchPageTitle());

  const likedCreatorKeys = useMemo(
    () => (filter === "liked" ? Array.from(likedCreators).sort() : []),
    [filter, likedCreators]
  );

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      let resettingPage = false;

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== "page" && key !== "q") resettingPage = true;
        if (key === "q" && value !== qParam) resettingPage = true;

        if (value === null) {
          params.delete(key);
        } else if (key === "q" && value === "") {
          params.delete(key);
        } else if (key === "filter" && value === "tous") {
          params.delete(key);
        } else if (key === "sort" && value === "favorites") {
          params.delete(key);
        } else if (key === "service" && value === "Tous") {
          params.delete(key);
        } else if (key === "page" && value === "1") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      if (resettingPage && !Object.prototype.hasOwnProperty.call(updates, "page")) {
        params.delete("page");
      }

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, qParam, router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== qParam) {
        updateParams({ q: query || null });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [qParam, query, updateParams]);

  useScrollRestoration(
    `search-${currentPage}-${filter}-${sortBy}-${serviceFilter}-${qParam}`,
    !loading
  );

  useEffect(() => {
    let active = true;

    const loadPage = async () => {
      setLoading(true);

      try {
        const cacheKey = buildSearchCacheKey({
          q: qParam,
          filter,
          sort: sortBy,
          service: serviceFilter,
          page: currentPage,
          perPage: PER_PAGE,
          likedCreatorKeys,
        });

        const data = await fetchJsonWithBrowserCache<SearchApiResponse>({
          key: cacheKey,
          ttlMs: SEARCH_BROWSER_CACHE_TTL_MS,
          shouldCache: shouldCacheSearchResponse,
          loader: async () => {
            const params = new URLSearchParams({
              q: qParam,
              filter,
              sort: sortBy,
              service: serviceFilter,
              page: String(currentPage),
              perPage: String(PER_PAGE),
            });
            likedCreatorKeys.forEach((key) => params.append("liked", key));

            const response = await fetch(`/api/creators/search?${params.toString()}`);
            if (!response.ok) {
              throw new Error("Network error");
            }

            return response.json();
          },
        });

        if (!active) {
          return;
        }

        startTransition(() => {
          setResultPage(data);
        });
      } catch {
        if (!active) {
          return;
        }

        startTransition(() => {
          setResultPage({
            items: [],
            total: 0,
            page: currentPage,
            perPage: PER_PAGE,
            services: [],
            syncedAt: null,
            source: "stale-cache",
          });
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadPage();

    return () => {
      active = false;
    };
  }, [currentPage, filter, likedCreatorKeys, qParam, serviceFilter, sortBy]);

  const services = useMemo(
    () => ["Tous", ...(resultPage?.services ?? [])],
    [resultPage?.services]
  );

  const displayed = resultPage?.items ?? [];
  const totalResults = resultPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / PER_PAGE));

  const goToPage = (nextPage: number) => {
    updateParams({ page: String(nextPage) });
  };

  const filterLabels: Record<SearchFilter, string> = {
    tous: "All",
    kemono: "Kemono",
    coomer: "Coomer",
    liked: "Liked",
  };

  const sortLabels: Record<SearchSort, string> = {
    favorites: "Popular",
    date: "Updated",
    az: "A-Z",
  };

  const emptyFilterHint =
    filter !== "tous" || query !== "" || serviceFilter !== "Tous";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#f0f0f5]">Search</h1>

      <div className="space-y-4 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-4">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search creators..."
              className="h-9 border-[#1e1e2e] bg-[#0a0a0f] pl-9 text-sm text-[#f0f0f5] placeholder:text-[#6b7280]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["favorites", "date", "az"] as SearchSort[]).map((value) => (
              <Button
                key={value}
                size="sm"
                onClick={() => updateParams({ sort: value })}
                className={`h-8 cursor-pointer text-xs transition-colors ${
                  sortBy === value
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "border border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                {sortLabels[value]}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[#1e1e2e]/50 pb-2">
          {(["tous", "kemono", "coomer", "liked"] as SearchFilter[]).map((value) => (
            <Button
              key={value}
              variant="outline"
              size="sm"
              onClick={() => updateParams({ filter: value })}
              className={`h-7 cursor-pointer px-3 text-xs transition-colors ${
                filter === value
                  ? value === "liked"
                    ? "border-red-500 bg-red-500/90 text-white hover:bg-red-600"
                    : "border-[#7c3aed] bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
            >
              {value === "liked" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Heart className={`h-3.5 w-3.5 ${filter === value ? "fill-current" : ""}`} />
                  <span>{filterLabels[value]}</span>
                </span>
              ) : (
                filterLabels[value]
              )}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="mr-1 h-4 w-4 text-[#6b7280]" />
          {services.map((service) => (
            <Badge
              key={service}
              onClick={() => updateParams({ service })}
              className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                serviceFilter === service
                  ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "border border-[#1e1e2e] bg-[#0a0a0f] text-[#6b7280] hover:bg-[#1e1e2e]"
              }`}
            >
              {service === "Tous" ? "All" : service}
            </Badge>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-2xl border border-[#1e1e2e] bg-[#12121a]"
              style={{ aspectRatio: "16/20" }}
            />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
          <SearchIcon className="mx-auto mb-4 h-12 w-12 text-[#6b7280]" />
          <p className="text-lg text-[#6b7280]">No results</p>
          {emptyFilterHint && (
            <p className="mt-1 text-sm text-[#6b7280]">Try different filters or another search.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[#6b7280]">
              {totalResults} result{totalResults > 1 ? "s" : ""}
              {totalPages > 1 && (
                <span className="ml-2 text-[#4b5563]">
                  - page {currentPage}/{totalPages}
                </span>
              )}
            </p>
          </div>

          {totalPages > 1 && <Pagination current={currentPage} total={totalPages} onChange={goToPage} />}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {displayed.map((creator) => (
              <CreatorCard
                key={`${creator.site}-${creator.service}-${creator.id}`}
                id={creator.id}
                name={creator.name}
                service={creator.service}
                site={creator.site}
                favorited={creator.favorited}
                updated={creator.updated}
              />
            ))}
          </div>

          {totalPages > 1 && <Pagination current={currentPage} total={totalPages} onChange={goToPage} />}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}


