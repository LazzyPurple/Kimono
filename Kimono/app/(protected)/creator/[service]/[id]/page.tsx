import { Badge } from "@/components/ui/badge";
import { User, ExternalLink } from "lucide-react";

interface CreatorPageProps {
  params: Promise<{
    service: string;
    id: string;
  }>;
}

export default async function CreatorPage({ params }: CreatorPageProps) {
  const { service, id } = await params;

  return (
    <div className="space-y-6">
      {/* En-tête créateur */}
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-[#7c3aed]/20 flex items-center justify-center">
            <User className="h-8 w-8 text-[#7c3aed]" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#f0f0f5]">
                Créateur {id}
              </h1>
              <Badge className="bg-[#7c3aed]/20 text-[#7c3aed]">
                {service}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[#6b7280] text-sm">
              <ExternalLink className="h-3 w-3" />
              <span>
                {service} / {id}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Posts placeholder */}
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
        <p className="text-[#6b7280] text-lg">
          Les posts de ce créateur apparaîtront ici.
        </p>
        <p className="text-[#6b7280] text-sm mt-2">
          Connexion à l&apos;API en cours de développement.
        </p>
      </div>
    </div>
  );
}
