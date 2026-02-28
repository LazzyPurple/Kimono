import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-bold text-[#f0f0f5]">
          Bienvenue sur{" "}
          <span className="text-[#7c3aed]">Kimono</span>
        </h1>
        <p className="text-[#6b7280] text-lg max-w-2xl mx-auto">
          Explorez et découvrez du contenu depuis Kemono et Coomer, unifié en un
          seul endroit.
        </p>
      </section>

      {/* Sections */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6 space-y-3 hover:border-[#7c3aed]/50 transition-colors">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-[#7c3aed]" />
            <h2 className="text-lg font-semibold text-[#f0f0f5]">Récents</h2>
            <Badge variant="secondary" className="bg-[#7c3aed]/20 text-[#7c3aed]">
              Nouveau
            </Badge>
          </div>
          <p className="text-sm text-[#6b7280]">
            Les derniers posts publiés sur les deux plateformes.
          </p>
        </div>

        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6 space-y-3 hover:border-[#7c3aed]/50 transition-colors">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#7c3aed]" />
            <h2 className="text-lg font-semibold text-[#f0f0f5]">Tendances</h2>
          </div>
          <p className="text-sm text-[#6b7280]">
            Les créateurs et contenus les plus populaires du moment.
          </p>
        </div>

        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6 space-y-3 hover:border-[#7c3aed]/50 transition-colors">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#7c3aed]" />
            <h2 className="text-lg font-semibold text-[#f0f0f5]">Découvrir</h2>
          </div>
          <p className="text-sm text-[#6b7280]">
            Découvrez de nouveaux créateurs et explorez leur contenu.
          </p>
        </div>
      </div>

      {/* Placeholder contenu */}
      <section className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-8 text-center">
        <p className="text-[#6b7280]">
          Le contenu récent apparaîtra ici une fois connecté à l&apos;API.
        </p>
      </section>
    </div>
  );
}
