"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import CreatorCard from "@/components/CreatorCard";
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import type { UnifiedCreator } from "@/lib/api/unified";

type Filter = "tous" | "kemono" | "coomer" | "liked";

const PER_PAGE = 50;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [allCreators, setAllCreators] = useState<UnifiedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("tous");
  const [currentPage, setCurrentPage] = useState(1);
  const { isCreatorLiked } = useLikes();
  const deferredQuery = useDeferredValue(query);

  /* Fetch all creators on mount */
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const res = await fetch("/api/search-creators?q=");
        if (!res.ok) throw new Error("Erreur réseau");
        const data: UnifiedCreator[] = await res.json();
        if (!Array.isArray(data)) throw new Error("L'API n'a pas retourné de tableau");
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

  /* Reset page on filter or query change */
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, deferredQuery]);

  /* Client-side filtering */
  const displayed = useMemo(() => {
    let list = allCreators;

    // Text filter
    if (deferredQuery.trim()) {
      const q = deferredQuery.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Site / liked filter
    if (filter === "kemono") list = list.filter((c) => c.site === "kemono");
    else if (filter === "coomer") list = list.filter((c) => c.site === "coomer");
    else if (filter === "liked")
      list = list.filter((c) => isCreatorLiked(c.site, c.service, c.id));

    return list;
  }, [allCreators, deferredQuery, filter, isCreatorLiked]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PER_PAGE));
  const paginated = displayed.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE
  );

  const goToPage = (p: number) => {
    setCurrentPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#f0f0f5]">Accueil</h1>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un créateur…"
            className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] pl-9"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["tous", "kemono", "coomer", "liked"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant="outline"
            size="sm"
            onClick={() => setFilter(f)}
            className={`border-[#1e1e2e] cursor-pointer transition-colors ${
              filter === f
                ? f === "liked"
                  ? "bg-red-500 border-red-500 text-white hover:bg-red-600"
                  : "bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]"
                : "text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            }`}
          >
            {f === "liked" ? "❤ Likés" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
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
          <p className="text-[#6b7280] text-lg">Aucun résultat</p>
          {filter !== "tous" && (
            <p className="text-[#6b7280] text-sm mt-1">
              Essayez avec le filtre « Tous »
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Counter + top pagination */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-[#6b7280]">
              {displayed.length} résultat{displayed.length > 1 ? "s" : ""}
              {totalPages > 1 && (
                <span className="ml-2 text-[#4b5563]">
                  — page {currentPage}/{totalPages}
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
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
