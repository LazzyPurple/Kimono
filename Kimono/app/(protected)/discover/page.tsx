"use client";

import { useState, useEffect, useMemo } from "react";
import { Compass, Loader2, Play, Search, SlidersHorizontal, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import CreatorCard from "@/components/CreatorCard";
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import type { Site } from "@/lib/api/helpers";

interface DiscoveryCreator {
  id: string;
  name: string;
  service: string;
  site: Site;
  score: number;
  updated?: string;
}

export default function DiscoverPage() {
  const [creators, setCreators] = useState<DiscoveryCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "az">("score");
  const [filterService, setFilterService] = useState("Tous");
  const [currentPage, setCurrentPage] = useState(1);

  const { isCreatorLiked } = useLikes();

  // On mount, load cache if exists
  useEffect(() => {
    fetchResults();
  }, []);

  // Simulate progress when computing
  useEffect(() => {
    if (!computing) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95; // Stop ascending at 95% until actually done
        return p + Math.random() * 5;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [computing]);

  async function fetchResults() {
    try {
      setLoading(true);
      const res = await fetch("/api/discover/results");
      const data = await res.json();
      if (data.creators) {
        setCreators(data.creators);
        setUpdatedAt(data.updatedAt);
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
      const res = await fetch("/api/discover/compute", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setProgress(100);
        await new Promise(r => setTimeout(r, 500)); // Let the user see 100%
        await fetchResults();
      } else {
        alert(data.error || "Erreur lors du calcul");
      }
    } catch (error) {
      console.error("Compute error:", error);
      alert("Erreur réseau lors du calcul");
    } finally {
      setComputing(false);
      setProgress(0);
    }
  }

  async function handleBlock(creator: DiscoveryCreator, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Optimistic UI updates
    setCreators((prev) => 
      prev.filter((c) => !(c.site === creator.site && c.service === creator.service && c.id === creator.id))
    );

    try {
      await fetch("/api/discover/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: creator.site,
          service: creator.service,
          creatorId: creator.id
        })
      });
    } catch (error) {
      console.error("Failed to block creator", error);
    }
  }

  // Derived state for filtering and sorting
  const dynamicServices = useMemo(() => {
    const s = new Set(creators.map(c => c.service));
    return ["Tous", ...Array.from(s).sort()];
  }, [creators]);

  const filteredAndSorted = useMemo(() => {
    let result = creators.filter((c) => {
      // 1. Filter out inherently liked
      if (isCreatorLiked(c.site, c.service, c.id)) return false;
      // 2. Filter by service
      if (filterService !== "Tous" && c.service !== filterService) return false;
      // 3. Filter by search text
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "az") return a.name.localeCompare(b.name);
      return b.score - a.score; // default "score"
    });

    return result;
  }, [creators, search, filterService, sortBy, isCreatorLiked]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * 50;
    return filteredAndSorted.slice(startIndex, startIndex + 50);
  }, [filteredAndSorted, currentPage]);


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Compass className="h-6 w-6 text-[#7c3aed]" />
            <h1 className="text-2xl font-bold text-[#f0f0f5]">Découverte</h1>
          </div>
          <p className="text-[#6b7280]">
            Créateurs recommandés basés sur vos favoris actuels
          </p>
          {updatedAt && (
            <p className="text-xs text-[#6b7280] mt-1">
              Dernière mise à jour : {new Date(updatedAt).toLocaleString("fr-FR")}
            </p>
          )}
        </div>
        
        <Button 
          onClick={handleCompute} 
          disabled={computing}
          className="bg-[#7c3aed] text-white hover:bg-[#6d28d9] min-w-[200px]"
        >
          {computing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calcul en cours... {Math.round(progress)}%
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4 fill-current" />
              {updatedAt ? "Recalculer" : "Calculer"}
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[4/5] bg-[#1e1e2e] animate-pulse rounded-xl" />
          ))}
        </div>
      ) : creators.length === 0 ? (
        <div className="text-center py-20 bg-[#12121a] rounded-xl border border-[#1e1e2e]">
          <Compass className="mx-auto h-12 w-12 text-[#6b7280] mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-[#f0f0f5] mb-2">
            Aucune recommandation
          </h3>
          <p className="text-[#6b7280] mb-6">
            Cliquez sur "Calculer" pour générer des recommandations basées sur vos favoris.
          </p>
          <Button onClick={handleCompute} disabled={computing} className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]">
            {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
            Calculer les recommandations
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
              <Input
                placeholder="Rechercher un créateur..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#6b7280]" />
              <div className="flex bg-[#12121a] border border-[#1e1e2e] rounded-lg p-1">
                <button
                  onClick={() => setSortBy("score")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    sortBy === "score"
                      ? "bg-[#1e1e2e] text-[#f0f0f5]"
                      : "text-[#6b7280] hover:text-[#f0f0f5]"
                  }`}
                >
                  Pertinence
                </button>
                <button
                  onClick={() => setSortBy("az")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    sortBy === "az"
                      ? "bg-[#1e1e2e] text-[#f0f0f5]"
                      : "text-[#6b7280] hover:text-[#f0f0f5]"
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
                  onClick={() => {
                    setFilterService(service);
                    setCurrentPage(1);
                  }}
                  variant={filterService === service ? "default" : "outline"}
                  className={`cursor-pointer ${
                    filterService === service
                      ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9] border-transparent"
                      : "border-[#1e1e2e] text-[#6b7280] hover:border-[#7c3aed]/50 hover:text-[#f0f0f5] bg-[#12121a]"
                  }`}
                >
                  {service}
                </Badge>
              ))}
            </div>
          </div>
          
          <div className="text-sm text-[#6b7280]">
            {filteredAndSorted.length} recommandation{filteredAndSorted.length > 1 ? 's' : ''} trouvée{filteredAndSorted.length > 1 ? 's' : ''}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {paginatedResults.map((creator) => (
              <div key={`${creator.site}-${creator.service}-${creator.id}`} className="relative group">
                <CreatorCard
                  id={creator.id}
                  name={creator.name}
                  service={creator.service}
                  site={creator.site}
                  updated={creator.updated}
                />
                <button
                  onClick={(e) => handleBlock(creator, e)}
                  title="Masquer ce créateur"
                  className="absolute bottom-2 left-2 p-2 rounded-full bg-black/40 hover:bg-black/80 text-[#6b7280] hover:text-red-500 transition-all z-10 opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {filteredAndSorted.length > 0 && (
            <div className="py-6">
              <Pagination 
                current={currentPage}
                total={Math.ceil(filteredAndSorted.length / 50)}
                onChange={(p) => {
                  setCurrentPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
