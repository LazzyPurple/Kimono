"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock3, Film, Image as ImageIcon } from "lucide-react";
import type { Site } from "@/lib/api/helpers";
import { detectMediaKind, getThumbnailUrl } from "@/lib/media-platform";

interface MediaCardProps {
  title: string;
  previewImageUrl?: string;
  videoUrl?: string;
  videoCandidates?: string[];
  type?: "image" | "video" | "text";
  site: Site;
  service: string;
  postId: string;
  user: string;
  publishedAt?: string | number;
  durationSeconds?: number | null;
  videoPreviewMode?: "hover" | "viewport" | "disabled";
  priority?: boolean;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaMimeType?: string | null;
  detailSource?: string;
}

function formatPublishedDate(publishedAt?: string | number): string | null {
  if (!publishedAt) return null;
  const date = new Date(typeof publishedAt === "number" ? publishedAt * 1000 : publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB");
}

function formatDuration(durationSeconds?: number | null): string | null {
  if (!durationSeconds || !Number.isFinite(durationSeconds)) return null;
  const total = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function MediaCard({
  title,
  previewImageUrl,
  videoUrl,
  type = "image",
  site,
  service,
  postId,
  publishedAt,
  durationSeconds = null,
  priority = false,
  mediaMimeType = null,
}: MediaCardProps) {
  const [activated, setActivated] = useState(false);
  const [imageError, setImageError] = useState(false);

  const mediaKind = useMemo(() => detectMediaKind({ mimeType: mediaMimeType, imageUrl: previewImageUrl, videoUrl, type }), [mediaMimeType, previewImageUrl, type, videoUrl]);
  const thumbnailUrl = useMemo(() => getThumbnailUrl(site, previewImageUrl ?? videoUrl ?? null), [previewImageUrl, site, videoUrl]);
  const publishedLabel = formatPublishedDate(publishedAt);
  const durationLabel = formatDuration(durationSeconds);
  const href = `/posts/${site}/${postId}`;

  return (
    <Link href={href} className="neo-panel group flex h-full flex-col overflow-hidden bg-[#111111] transition-transform duration-150 hover:-translate-x-1 hover:-translate-y-1" onMouseEnter={() => setActivated(true)}>
      <div className="relative aspect-[4/5] overflow-hidden border-b-2 border-white bg-[#0a0a0a]">
        {mediaKind === "video" && videoUrl ? (
          <video
            className="h-full w-full object-cover"
            src={activated ? videoUrl : undefined}
            poster={!imageError ? thumbnailUrl ?? undefined : undefined}
            preload="none"
            muted
            loop
            playsInline
            onCanPlay={(event) => { event.currentTarget.play().catch(() => {}); }}
          />
        ) : thumbnailUrl && !imageError ? (
          <img
            src={thumbnailUrl}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#1a1a1a] text-[#888888]">
            {mediaKind === "video" ? <Film className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="border-2 border-white bg-[#111111] px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">{mediaKind}</span>
          {durationLabel ? <span className="border-2 border-white bg-[#7C3AED] px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">{durationLabel}</span> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-2">
          <p className="neo-label">{site}</p>
          <h3 className="line-clamp-2 text-lg font-black text-white">{title || "Untitled"}</h3>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#888888]">
          <span className="border-2 border-white px-2 py-1">{service}</span>
          {publishedLabel ? <span className="inline-flex items-center gap-2 border-2 border-white px-2 py-1"><Clock3 className="h-3.5 w-3.5" />{publishedLabel}</span> : null}
        </div>
      </div>
    </Link>
  );
}