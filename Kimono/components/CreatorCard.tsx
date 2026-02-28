import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import type { Site } from "@/lib/api/unified";

interface CreatorCardProps {
  id: string;
  name: string;
  service: string;
  site: Site;
  favorited?: number;
  indexed?: number;
  updated?: number;
}

export default function CreatorCard({
  id,
  name,
  service,
  site,
  favorited,
  updated,
}: CreatorCardProps) {
  return (
    <a href={`/creator/${service}/${id}`}>
      <Card className="bg-[#12121a] border-[#1e1e2e] group hover:border-[#7c3aed]/50 transition-all duration-300 cursor-pointer">
        <CardContent className="p-4 flex items-center gap-4">
          {/* Avatar */}
          <div className="h-12 w-12 rounded-full bg-[#7c3aed]/20 flex items-center justify-center shrink-0 group-hover:bg-[#7c3aed]/30 transition-colors">
            <User className="h-6 w-6 text-[#7c3aed]" />
          </div>

          {/* Infos */}
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-sm font-medium text-[#f0f0f5] truncate">
              {name}
            </h3>
            <div className="flex items-center gap-2">
              <Badge
                className={`text-xs ${
                  site === "kemono"
                    ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                    : "bg-pink-600/20 text-pink-400"
                }`}
              >
                {site}
              </Badge>
              <Badge
                variant="outline"
                className="border-[#1e1e2e] text-[#6b7280] text-xs"
              >
                {service}
              </Badge>
            </div>
          </div>

          {/* Stats */}
          <div className="text-right shrink-0 space-y-1">
            {favorited !== undefined && (
              <p className="text-xs text-[#6b7280]">
                ❤ {favorited.toLocaleString()}
              </p>
            )}
            {updated !== undefined && (
              <p className="text-xs text-[#6b7280]">
                {new Date(updated * 1000).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
