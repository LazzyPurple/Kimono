import { Heart } from "lucide-react";

export default function FavoritesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Heart className="h-6 w-6 text-[#7c3aed]" />
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Favoris</h1>
      </div>

      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
        <Heart className="h-12 w-12 text-[#6b7280] mx-auto mb-4" />
        <p className="text-[#6b7280] text-lg">
          Vos créateurs et posts favoris apparaîtront ici.
        </p>
        <p className="text-[#6b7280] text-sm mt-2">
          Commencez par explorer et ajouter du contenu à vos favoris.
        </p>
      </div>
    </div>
  );
}
