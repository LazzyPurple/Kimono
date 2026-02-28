"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon } from "lucide-react";

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#f0f0f5]">Recherche</h1>

      {/* Barre de recherche */}
      <div className="flex gap-2">
        <Input
          placeholder="Rechercher un créateur..."
          className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] flex-1"
        />
        <Button className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer">
          <SearchIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-[#1e1e2e] text-[#f0f0f5] hover:bg-[#1e1e2e] cursor-pointer"
        >
          Tous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] cursor-pointer"
        >
          Kemono
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] cursor-pointer"
        >
          Coomer
        </Button>
      </div>

      {/* Résultats placeholder */}
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
        <SearchIcon className="h-12 w-12 text-[#6b7280] mx-auto mb-4" />
        <p className="text-[#6b7280] text-lg">
          Tapez un nom de créateur pour lancer la recherche.
        </p>
      </div>
    </div>
  );
}
