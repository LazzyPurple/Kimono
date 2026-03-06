"use client";

import { useState } from "react";
import { Heart, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLikes } from "@/contexts/LikesContext";
import { proxyCdnUrl, type Site } from "@/lib/api/helpers";

interface CreatorCardProps {
  id: string;
  name: string;
  service: string;
  site: Site;
  favorited?: number;
  updated?: string | number;
}

export default function CreatorCard({
  id,
  name,
  service,
  site,
  favorited,
  updated,
}: CreatorCardProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const { isCreatorLiked, toggleCreatorLike } = useLikes();

  const liked = isCreatorLiked(site, service, id);

  const avatarUrl = proxyCdnUrl(site, `/icons/${service}/${id}`);
  const bannerUrl = proxyCdnUrl(site, `/banners/${service}/${id}`);
  
  const isGumroad = service.toLowerCase() === "gumroad";
  const displayBannerUrl = isGumroad ? avatarUrl : bannerUrl;

  const siteColor = site === "kemono" ? "#7c3aed" : "#db2777";
  const siteBadgeClass =
    site === "kemono"
      ? "bg-[#7c3aed]/80 text-white"
      : "bg-pink-600/80 text-white";

  return (
    <a href={`/creator/${site}/${service}/${id}`} className="block group">
      <div
        className="rounded-2xl overflow-hidden border-2 transition-all duration-300 cursor-pointer"
        style={{
          backgroundColor: "#12121a",
          borderColor: liked ? "#ef4444" : "rgba(124,58,237,0.25)",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = liked ? "#ef4444" : siteColor)
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor =
            liked ? "#ef444488" : "rgba(124,58,237,0.25)")
        }
      >
        {/* ── Banner ───────────────────────────────────────────── */}
        <div className="relative" style={{ aspectRatio: "16/9" }}>
          {/* Wrapper image avec overflow-hidden pour ne pas que l'image dépasse au hover */}
          <div className="absolute inset-0 overflow-hidden">
            {!bannerError ? (
              <img
                src={displayBannerUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setBannerError(true)}
                className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
                  isGumroad ? "object-contain bg-[#0a0a0f]" : "object-cover"
                }`}
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${siteColor}33 0%, #1e1e2e 100%)`,
                }}
              />
            )}

            {/* Voile dégradé */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#12121a] via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Like button top-left */}
          <div className="absolute top-2 left-2 z-10">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleCreatorLike(site, service, id);
              }}
              className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
            >
              <Heart
                className={`h-4 w-4 transition-colors ${
                  liked ? "text-red-500 fill-red-500" : "text-white/80"
                }`}
              />
            </button>
          </div>

          {/* Badge site top-right */}
          <div className="absolute top-2 right-2 z-10">
            <Badge className={`text-xs ${siteBadgeClass}`}>{site}</Badge>
          </div>

          {/* Avatar circulaire */}
          {!isGumroad && (
            <div className="absolute -bottom-5 left-4 z-10">
              <div
                className="h-14 w-14 rounded-full overflow-hidden flex items-center justify-center border-2 bg-[#12121a]"
                style={{
                  borderColor: "#12121a",
                }}
              >
                {!avatarError ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <User className="h-7 w-7 text-[#7c3aed]" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer info ──────────────────────────────────────── */}
        <div className={`px-4 pb-4 space-y-1.5 ${isGumroad ? "pt-4" : "pt-7"}`}>
          <h3 className="text-sm font-bold text-[#f0f0f5] truncate leading-tight">
            {name}
          </h3>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge
                variant="outline"
                className="border-[#1e1e2e] text-[#6b7280] text-xs shrink-0"
              >
                {service}
              </Badge>
            </div>

            <div className="flex items-center gap-3 text-xs text-[#6b7280] shrink-0">
              {favorited !== undefined && (
                <span className="flex items-center gap-1">
                  <span>❤</span>
                  <span>{favorited.toLocaleString()}</span>
                </span>
              )}
              {updated !== undefined && (
                <span>{new Date(typeof updated === "number" ? updated * 1000 : updated).toLocaleDateString("fr-FR")}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
