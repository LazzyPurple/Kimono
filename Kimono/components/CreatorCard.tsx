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
  favorited?: number | null;
  updated?: string | number;
}

function formatCreatorDate(updated?: string | number): string | null {
  if (updated === undefined) {
    return null;
  }

  const date = new Date(typeof updated === "number" ? updated * 1000 : updated);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-GB");
}

function formatServiceLabel(service: string): string {
  const normalized = String(service || "").trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getServiceBadgeClass(service: string): string {
  switch (service.toLowerCase()) {
    case "fansly":
      return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
    case "onlyfans":
      return "border-sky-400/30 bg-sky-500/10 text-sky-100";
    case "patreon":
      return "border-orange-400/30 bg-orange-500/10 text-orange-100";
    case "fanbox":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "gumroad":
      return "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100";
    default:
      return "border-white/10 bg-white/5 text-[#d7dae5]";
  }
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
  const displayDate = formatCreatorDate(updated);
  const serviceBadgeClass = getServiceBadgeClass(service);

  const isGumroad = service.toLowerCase() === "gumroad";
  const displayBannerUrl = isGumroad ? avatarUrl : bannerUrl;

  const siteColor = site === "kemono" ? "#7c3aed" : "#db2777";
  const siteBadgeClass =
    site === "kemono"
      ? "bg-[#7c3aed]/80 text-white"
      : "bg-pink-600/80 text-white";

  return (
    <a href={`/creator/${site}/${service}/${id}`} className="group block">
      <div
        className="overflow-hidden rounded-2xl border-2 bg-[#12121a] transition-all duration-300"
        style={{
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
        <div className="relative" style={{ aspectRatio: "16/9" }}>
          <div className="absolute inset-0 overflow-hidden">
            {!bannerError ? (
              <img
                src={displayBannerUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setBannerError(true)}
                className={`h-full w-full transition-transform duration-500 group-hover:scale-105 ${
                  isGumroad ? "object-contain bg-[#0a0a0f]" : "object-cover"
                }`}
              />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background: `linear-gradient(135deg, ${siteColor}33 0%, #1e1e2e 100%)`,
                }}
              />
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#12121a] via-transparent to-transparent" />
          </div>

          <div className="absolute left-2 top-2 z-10">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleCreatorLike(site, service, id);
              }}
              className="cursor-pointer rounded-full bg-black/40 p-1.5 transition-colors hover:bg-black/60"
            >
              <Heart
                className={`h-4 w-4 transition-colors ${
                  liked ? "fill-red-500 text-red-500" : "text-white/80"
                }`}
              />
            </button>
          </div>

          <div className="absolute right-2 top-2 z-10">
            <Badge className={`text-xs ${siteBadgeClass}`}>{site}</Badge>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#1e1e2e] bg-[#0a0a0f]"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              {!avatarError ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-6 w-6 text-[#7c3aed]" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="min-h-[2.5rem] break-words text-sm font-bold leading-tight text-[#f0f0f5]">
                {name}
              </h3>

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={`whitespace-nowrap border text-xs ${serviceBadgeClass}`}
                >
                  {formatServiceLabel(service)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-[#8b93a7]">
            {favorited != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-1 text-pink-50">
                <Heart className="h-3.5 w-3.5 fill-pink-400 text-pink-400" />
                <span>{favorited.toLocaleString()} likes</span>
              </span>
            )}
            {displayDate && (
              <span className="inline-flex items-center rounded-full border border-[#1e1e2e] bg-[#0a0a0f] px-2.5 py-1">
                {displayDate}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}
