"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Compass, Loader2, Play, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import CreatorCard from "@/components/CreatorCard";
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { buildAppPageTitle } from "@/lib/page-titles";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Site } from "@/lib/api/helpers";
import { fetchJsonWithBrowserCache } from "@/lib/browser-data-cache";
import { BROWSER_POST_CACHE_TTL_MS } from "@/lib/perf-cache";

interface DiscoveryCreator {
  id: string;
  name: string;
  service: string;
  site: Site;
  score: number;
  updated?: string;
}

function DiscoverPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useDocumentTitle(buildAppPageTitle("Discover"));

  const qParam = searchParams.get("q") ?? "";
  const sortParam = (searchParams.get("sort") as "score" | "az") ?? "score";
  const serviceParam = searchParams.get("service") ?? "Tous";
  const rawPageParam = Number(searchParams.get("page") ?? "1");
  const pageParam = Number.isFinite(rawPageParam) && rawPageParam > 0 ? Math.trunc(rawPageParam) : 1;

  const [creators, setCreators] = useState<DiscoveryCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(qParam);

  const { isCreatorLiked } = useLikes();

  useScrollRestoration(`discover-${pageParam}`, !loading);

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
        } else if (key === "sort" && value === "score") {
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

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, qParam, router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== qParam) {
        updateParams({ q: searchQuery || null });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [qParam, searchQuery, updateParams]);

  useEffect(() => {
    void fetchResults();
  }, []);

  useEffect(() => {
    if (!computing) {
      return;
    }

    setProgress(0);
    const interval = setInterval(() => {
      setProgress((value) => {
        if (value >= 95) {
          return 95;
        }
        return value + Math.random() * 5;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [computing]);

  async function fetchResults() {
    try {
      setLoading(true);
      const data = await fetchJsonWithBrowserCache<{ creators?: DiscoveryCreator[]; updatedAt?: string | null }>({
        key: "discover-results",
        ttlMs: BROWSER_POST_CACHE_TTL_MS,
        loader: async () => {
          const response = await fetch("/api/discover/results");
          if (!response.ok) {
            throw new Error("Failed to load discover results.");
          }
          return response.json() as Promise<{ creators?: DiscoveryCreator[]; updatedAt?: string | null }>;
        },
      });
      if (data.creators) {
        setCreators(data.creators);
        setUpdatedAt(data.updatedAt ?? null);
      }
    } catch (error) {
      console.error("Error fetching discover results:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompute() {
    setComputing(true);
    try {
      const response = await fetch("/api/discover/compute", { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        setProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchResults();
      } else {
        alert(data.error || "Failed to compute recommendations.");
      }
    } catch (error) {
      console.error("Compute error:", error);
      alert("Network error while computing recommendations.");
    } finally {
      setComputing(false);
      setProgress(0);
    }
  }

  async function handleBlock(creator: DiscoveryCreator, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    setCreators((previous) =>
      previous.filter(
        (item) => !(item.site === creator.site && item.service === creator.service && item.id === creator.id)
      )
    );

    try {
      await fetch("/api/discover/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: creator.site,
          service: creator.service,
          creatorId: creator.id,
        }),
      });
    } catch (error) {
      console.error("Failed to block creator", error);
    }
  }

  const dynamicServices = useMemo(() => {
    const values = new Set(creators.map((creator) => creator.service));
    return ["Tous", ...Array.from(values).sort()];
  }, [creators]);

  const filteredAndSorted = useMemo(() => {
    const result = creators.filter((creator) => {
      if (isCreatorLiked(creator.site, creator.service, creator.id)) return false;
      if (serviceParam !== "Tous" && creator.service !== serviceParam) return false;
      if (qParam && !creator.name.toLowerCase().includes(qParam.toLowerCase())) return false;
      return true;
    });

    result.sort((left, right) => {
      if (sortParam === "az") {
        return left.name.localeCompare(right.name);
      }
      return right.score - left.score;
    });

    return result;
  }, [creators, isCreatorLiked, qParam, serviceParam, sortParam]);

  const paginatedResults = useMemo(() => {
    const startIndex = (pageParam - 1) * 50;
    return filteredAndSorted.slice(startIndex, startIndex + 50);
  }, [filteredAndSorted, pageParam]);

  const showInitialSkeleton = loading && creators.length === 0;
  const showRefreshingState = loading && creators.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Compass className="h-6 w-6 text-[#7c3aed]" />
            <h1 className="text-2xl font-bold text-[#f0f0f5]">Discover</h1>
          </div>
          <p className="text-[#6b7280]">Recommended creators based on your current favorites.</p>
          {updatedAt && (
            <p className="mt-1 text-xs text-[#6b7280]">Last updated: {new Date(updatedAt).toLocaleString("en-GB")}</p>
          )}
        </div>

        <Button onClick={() => void handleCompute()} disabled={computing} className="min-w-[200px] bg-[#7c3aed] text-white hover:bg-[#6d28d9]">
          {computing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Computing... {Math.round(progress)}%
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4 fill-current" />
              {updatedAt ? "Recompute" : "Compute"}
            </>
          )}
        </Button>
      </div>

      {showInitialSkeleton ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="aspect-[4/5] animate-pulse rounded-xl bg-[#1e1e2e]" />
          ))}
        </div>
      ) : creators.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] py-20 text-center">
          <Compass className="mx-auto mb-4 h-12 w-12 text-[#6b7280] opacity-50" />
          <h3 className="mb-2 text-lg font-medium text-[#f0f0f5]">No recommendations yet</h3>
          <p className="mb-6 text-[#6b7280]">Click compute to generate recommendations based on your favorites.</p>
          <Button onClick={() => void handleCompute()} disabled={computing} className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]">
            {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
            Compute recommendations
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {showRefreshingState && (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1e1e2e] bg-[#12121a] px-3 py-1 text-xs text-[#6b7280]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7c3aed]" />
              Refreshing recommendations...
            </div>
          )}
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <Input
                placeholder="Search creators..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="border-[#1e1e2e] bg-[#12121a] pl-9 text-[#f0f0f5] placeholder:text-[#6b7280]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#6b7280]" />
              <div className="flex rounded-lg border border-[#1e1e2e] bg-[#12121a] p-1">
                <button
                  onClick={() => updateParams({ sort: "score" })}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    sortParam === "score" ? "bg-[#1e1e2e] text-[#f0f0f5]" : "text-[#6b7280] hover:text-[#f0f0f5]"
                  }`}
                >
                  Relevance
                </button>
                <button
                  onClick={() => updateParams({ sort: "az" })}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    sortParam === "az" ? "bg-[#1e1e2e] text-[#f0f0f5]" : "text-[#6b7280] hover:text-[#f0f0f5]"
                  }`}
                >
                  A-Z
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {dynamicServices.map((service) => (
                <Badge
                  key={service}
                  onClick={() => updateParams({ service })}
                  variant={serviceParam === service ? "default" : "outline"}
                  className={`cursor-pointer ${
                    serviceParam === service
                      ? "border-transparent bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                      : "border-[#1e1e2e] bg-[#12121a] text-[#6b7280] hover:border-[#7c3aed]/50 hover:text-[#f0f0f5]"
                  }`}
                >
                  {service === "Tous" ? "All" : service}
                </Badge>
              ))}
            </div>
          </div>

          <div className="text-sm text-[#6b7280]">
            {filteredAndSorted.length} recommendation{filteredAndSorted.length > 1 ? "s" : ""} found
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {paginatedResults.map((creator) => (
              <div key={`${creator.site}-${creator.service}-${creator.id}`} className="group relative">
                <CreatorCard
                  id={creator.id}
                  name={creator.name}
                  service={creator.service}
                  site={creator.site}
                  updated={creator.updated}
                />
                <button
                  onClick={(event) => void handleBlock(creator, event)}
                  title="Hide this creator"
                  className="absolute bottom-2 left-2 z-10 cursor-pointer rounded-full bg-black/40 p-2 text-[#6b7280] opacity-0 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-red-500 group-hover:opacity-100"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {filteredAndSorted.length > 0 && (
            <div className="py-6">
              <Pagination
                current={pageParam}
                total={Math.ceil(filteredAndSorted.length / 50)}
                onChange={(page) => {
                  updateParams({ page: String(page) });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      }
    >
      <DiscoverPageContent />
    </Suspense>
  );
}

