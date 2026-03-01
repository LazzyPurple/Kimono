"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import CreatorCard from "@/components/CreatorCard";
import type { UnifiedCreator } from "@/lib/api/unified";

type Filter = "tous" | "kemono" | "coomer";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedCreator[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState<Filter>("tous");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch(
          `/api/search-creators?q=${encodeURIComponent(query.trim())}`
        );
        const data: UnifiedCreator[] = await res.json();
        setResults(data);
      } catch (err) {
        console.error(err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const displayed =
    filter === "tous"
      ? results
      : results.filter((c) => c.site === filter);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#f0f0f5]">Recherche</h1>

      {/* Barre de recherche */}
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
        {loading && (
          <div className="flex items-center px-2">
            <Loader2 className="h-5 w-5 animate-spin text-[#7c3aed]" />
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {(["tous", "kemono", "coomer"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant="outline"
            size="sm"
            onClick={() => setFilter(f)}
            className={`border-[#1e1e2e] cursor-pointer transition-colors ${
              filter === f
                ? "bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-[#6d28d9]"
                : "text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Contenu */}
      {!searched && !loading ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
          <SearchIcon className="h-12 w-12 text-[#6b7280] mx-auto mb-4" />
          <p className="text-[#6b7280] text-lg">
            Tapez un nom de créateur pour lancer la recherche.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
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
          <p className="text-sm text-[#6b7280]">
            {displayed.length} résultat{displayed.length > 1 ? "s" : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
      )}
    </div>
  );
}
