import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Image, Film, FileText } from "lucide-react";
import type { Site } from "@/lib/api/unified";

interface MediaCardProps {
  title: string;
  thumbnailUrl?: string;
  type?: "image" | "video" | "text";
  site: Site;
  service: string;
  creatorName?: string;
  publishedAt?: string;
}

export default function MediaCard({
  title,
  thumbnailUrl,
  type = "image",
  site,
  service,
  creatorName,
  publishedAt,
}: MediaCardProps) {
  const TypeIcon = type === "video" ? Film : type === "text" ? FileText : Image;

  return (
    <Card className="bg-[#12121a] border-[#1e1e2e] overflow-hidden group hover:border-[#7c3aed]/50 transition-all duration-300 cursor-pointer">
      {/* Aperçu */}
      <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <TypeIcon className="h-12 w-12 text-[#6b7280]" />
        )}
        <div className="absolute top-2 right-2">
          <Badge
            className={`text-xs ${
              site === "kemono"
                ? "bg-[#7c3aed]/80 text-white"
                : "bg-pink-600/80 text-white"
            }`}
          >
            {site}
          </Badge>
        </div>
      </div>

      <CardContent className="p-3 space-y-1">
        <h3 className="text-sm font-medium text-[#f0f0f5] line-clamp-2">
          {title || "Sans titre"}
        </h3>
        <div className="flex items-center justify-between text-xs text-[#6b7280]">
          {creatorName && <span>{creatorName}</span>}
          <Badge variant="outline" className="border-[#1e1e2e] text-[#6b7280] text-xs">
            {service}
          </Badge>
        </div>
        {publishedAt && (
          <p className="text-xs text-[#6b7280]">
            {new Date(publishedAt).toLocaleDateString("fr-FR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
