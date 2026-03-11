"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, Loader2, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CreatorCard from "@/components/CreatorCard";
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import type { UnifiedCreator } from "@/lib/api/helpers";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Filter = "tous" | "kemono" | "coomer" | "liked";

const PER_PAGE = 50;

function SearchPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filter = (searchParams.get("filter") as Filter) ?? "tous";
  const sortBy = (searchParams.get("sort") as "date" | "favorites" | "az") ?? "favorites";
  const serviceFilter = searchParams.get("service") ?? "Tous";
  const currentPage = Number(searchParams.get("page") ?? "1");
  const qParam = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(qParam);
  const [allCreators, setAllCreators] = useState<UnifiedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const { isCreatorLiked } = useLikes();

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    let resettingPage = false;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== "page" && key !== "q") resettingPage = true;
      if (key === "q" && value !== qParam) resettingPage = true;

      if (value === null) {
        params.delete(key);
      } else {
        if (key === "q" && value === "") params.delete(key);
        else if (key === "filter" && value === "tous") params.delete(key);
        else if (key === "sort" && value === "favorites") params.delete(key);
        else if (key === "service" && value === "Tous") params.delete(key);
        else if (key === "page" && value === "1") params.delete(key);
        else params.set(key, value);
      }
    });

    if (resettingPage && !updates.hasOwnProperty("page")) {
      params.delete("page");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, qParam, router, searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== qParam) {
        updateParams({ q: query || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [qParam, query, updateParams]);

  useScrollRestoration(`search-${currentPage}-${filter}-${sortBy}`, !loading);

  /* Fetch all creators on mount */
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const res = await fetch("/api/search-creators?q=");
        if (!res.ok) throw new Error("Erreur rÃ©seau");
        const data: UnifiedCreator[] = await res.json();
        if (!Array.isArray(data)) throw new Error("L'API n'a pas retournÃ© de tableau");
        // Sort by favorited DESC
        data.sort((a, b) => (b.favorited ?? 0) - (a.favorited ?? 0));
        setAllCreators(data);
      } catch {
        setAllCreators([]);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);


  const services = useMemo(() => {
    const s = new Set(allCreators.map((c) => c.service));
    return ["Tous", ...Array.from(s).sort()];
  }, [allCreators]);

  /* Client-side filtering */
  const displayed = useMemo(() => {
    let list = [...allCreators];

    // Text filter
    if (qParam.trim()) {
      const q = qParam.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Site / liked filter
    if (filter === "kemono") list = list.filter((c) => c.site === "kemono");
    else if (filter === "coomer") list = list.filter((c) => c.site === "coomer");
    else if (filter === "liked")
      list = list.filter((c) => isCreatorLiked(c.site, c.service, c.id));

    // Service filter
    if (serviceFilter !== "Tous") {
      list = list.filter((c) => c.service === serviceFilter);
    }
    
    // Sorting
    list.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.updated || 0).getTime();
        const dateB = new Date(b.updated || 0).getTime();
        return dateB - dateA; // Descending
      }
      if (sortBy === "favorites") {
        return (b.favorited || 0) - (a.favorited || 0); // Descending global favorite count
      }
      if (sortBy === "az") {
        return a.name.localeCompare(b.name); // Ascending
      }
      return 0;
    });

    return list;
  }, [allCreators, qParam, filter, isCreatorLiked, serviceFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PER_PAGE));
  const paginated = displayed.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE
  );

  const goToPage = (p: number) => {
    updateParams({ page: String(p) });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#f0f0f5]">Accueil</h1>

      {/* Barre de filtres (recherche, tri, site) */}
      <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          {/* Recherche */}
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un crÃ©ateurâ€¦"
              className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] pl-9 text-sm h-9"
            />
          </div>
          
          {/* Tri */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => updateParams({ sort: "favorites" })}
              className={`cursor-pointer text-xs h-8 transition-colors ${
                sortBy === "favorites"
                  ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "bg-transparent border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
            >
              PopularitÃ©
            </Button>
            <Button
              size="sm"
              onClick={() => updateParams({ sort: "date" })}
              className={`cursor-pointer text-xs h-8 transition-colors ${
                sortBy === "date"
                  ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "bg-transparent border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
            >
              Last update
            </Button>
            <Button
              size="sm"
              onClick={() => updateParams({ sort: "az" })}
              className={`cursor-pointer text-xs h-8 transition-colors ${
                sortBy === "az"
                  ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "bg-transparent border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
            >
              A-Z
            </Button>
          </div>
        </div>

        {/* Filters de Site */}
        <div className="flex gap-2 flex-wrap pb-2 border-b border-[#1e1e2e]/50">
          {(["tous", "kemono", "coomer", "liked"] as Filter[]).map((f) => (
            <Button
              key={f}
              variant="outline"
              size="sm"
              onClick={() => updateParams({ filter: f })}
              className={`border-[#1e1e2e] cursor-pointer text-xs h-7 transition-colors px-3 ${
                filter === f
                  ? f === "liked"
                    ? "bg-red-500/90 border-red-500 text-white hover:bg-red-600"
                    : "bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "bg-transparent text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
              }`}
            >
              {f === "liked" ? "â¤ LikÃ©s" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        {/* Services */}
        <div className="flex flex-wrap gap-2 items-center">
          <SlidersHorizontal className="h-4 w-4 text-[#6b7280] mr-1" />
          {services.map((s) => (
            <Badge
              key={s}
              onClick={() => updateParams({ service: s })}
              className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                serviceFilter === s
                  ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "bg-[#0a0a0f] text-[#6b7280] border border-[#1e1e2e] hover:bg-[#1e1e2e]"
              }`}
            >
              {s}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#12121a] border border-[#1e1e2e] animate-pulse"
              style={{ aspectRatio: "16/20" }}
            />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
          <SearchIcon className="h-12 w-12 text-[#6b7280] mx-auto mb-4" />
          <p className="text-[#6b7280] text-lg">Aucun rÃ©sultat</p>
          {(filter !== "tous" || query !== "" || serviceFilter !== "Tous") && (
            <p className="text-[#6b7280] text-sm mt-1">
              Modifiez vos filtres ou votre recherche.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Counter + top pagination */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-[#6b7280]">
              {displayed.length} rÃ©sultat{displayed.length > 1 ? "s" : ""}
              {totalPages > 1 && (
                <span className="ml-2 text-[#4b5563]">
                  â€” page {currentPage}/{totalPages}
                </span>
              )}
            </p>
          </div>

          {totalPages > 1 && (
            <Pagination
              current={currentPage}
              total={totalPages}
              onChange={goToPage}
            />
          )}

          {/* Grid */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {paginated.map((creator) => (
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

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <Pagination
              current={currentPage}
              total={totalPages}
              onChange={goToPage}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex justify-center min-h-[50vh] items-center"><Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" /></div>}>
      <SearchPageContent />
    </Suspense>
  )
}

