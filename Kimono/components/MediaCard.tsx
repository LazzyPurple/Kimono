"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Image, Film, FileText, Play, Loader2 } from "lucide-react";
import type { Site } from "@/lib/api/unified";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { useServerThumbnail } from "@/hooks/useServerThumbnail";

interface MediaCardProps {
  title: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  type?: "image" | "video" | "text";
  site: Site;
  service: string;
  postId: string;
  user: string;
  creatorName?: string;
  publishedAt?: string;
}

export default function MediaCard({
  title,
  thumbnailUrl,
  videoUrl,
  type = "image",
  site,
  service,
  postId,
  user,
  creatorName,
  publishedAt,
}: MediaCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldFetchKemonoThumbnail =
    type === "video" && !thumbnailUrl && site === "kemono";
  const { thumbnailDataUrl: kemonoThumbnailDataUrl } = useVideoThumbnail(
    shouldFetchKemonoThumbnail ? (videoUrl ?? undefined) : undefined
  );

  const shouldFetchCoomerThumbnail =
    type === "video" && !thumbnailUrl && site === "coomer";
  const { thumbnailUrl: serverThumbnailDataUrl, loading: serverThumbnailLoading } =
    useServerThumbnail(
      shouldFetchCoomerThumbnail ? (videoUrl ?? undefined) : undefined
    );

  const effectiveThumbnail =
    thumbnailUrl || kemonoThumbnailDataUrl || serverThumbnailDataUrl || undefined;

  const TypeIcon = type === "video" ? Film : type === "text" ? FileText : Image;

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setHovered(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(false);
  }, []);

  const previewSrc = videoUrl || effectiveThumbnail;
  const showImg = !!effectiveThumbnail && !imgError;

  return (
    <div
      className="bg-[#12121a] border-[#1e1e2e] rounded-xl overflow-hidden group hover:border-[#7c3aed]/50 transition-all duration-300 cursor-pointer"
      onClick={() => router.push(`/post/${site}/${service}/${user}/${postId}`)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Aperçu */}
      <div className="relative aspect-square bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
        {serverThumbnailLoading ? (
          <div className="w-full h-full bg-[#12121a] animate-pulse flex items-center justify-center">
             <Film className="h-8 w-8 text-[#3f3f46] animate-pulse opacity-50" />
          </div>
        ) : hovered && type === "video" && previewSrc ? (
          <video
            src={previewSrc}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : hovered && type === "image" && showImg ? (
          <img
            src={effectiveThumbnail}
            alt={title}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center transition-all duration-300"
          />
        ) : showImg ? (
          <img
            src={effectiveThumbnail}
            alt={title}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <TypeIcon className="h-12 w-12 text-[#6b7280]" />
        )}

        {/* Overlay vidéo */}
        {type === "video" && !hovered && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Play className="h-10 w-10 text-white drop-shadow" />
          </div>
        )}

        {/* Badge site */}
        <div className="absolute top-2 right-2 z-10">
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

        {/* Badge type */}
        {type !== "image" && (
          <div className="absolute top-2 left-2 z-10">
            <Badge className="bg-black/60 text-white text-xs">
              {type === "video" ? "Vidéo" : "Texte"}
            </Badge>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1">
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
      </div>
    </div>
  );
}
