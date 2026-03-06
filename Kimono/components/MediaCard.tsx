"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Image, Film, FileText, Play, Heart } from "lucide-react";
import type { Site } from "@/lib/api/helpers";
import { useLikes } from "@/contexts/LikesContext";

interface MediaCardProps {
  title: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
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
  videoThumbnailUrl,
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
  const [hasHovered, setHasHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(hovered);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | undefined>(undefined);

  const { isPostLiked, togglePostLike } = useLikes();
  const liked = isPostLiked(site, service, postId);

  // thumbnailUrl vient de getPostThumbnail()
  // Pour Kemono: trick .jpg direct (via img.kemono.cr)
  // Pour Coomer (vidéos): api proxy video-thumbnail
  const showImg = !!thumbnailUrl && !imgError;

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHovered(true);
      setHasHovered(true);
    }, 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(false);
  }, []);

  useEffect(() => {
    isHoveredRef.current = hovered;
    const video = videoRef.current;
    if (!video) return;

    if (hovered) {
      playPromiseRef.current = video.play();
      if (playPromiseRef.current) {
        playPromiseRef.current.catch(() => {});
      }
    } else {
      if (playPromiseRef.current) {
        playPromiseRef.current.then(() => {
          if (!isHoveredRef.current) {
            video.pause();
            video.currentTime = 0;
          }
        }).catch(() => {});
      } else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, [hovered]);

  const previewSrc = videoUrl || thumbnailUrl;
  const isCoomerVideo = type === "video" && site === "coomer";
  const forceVideoStatic = isCoomerVideo && !showImg;

  return (
    <div
      className={`bg-[#12121a] rounded-xl overflow-hidden group transition-all duration-300 cursor-pointer border ${
        liked ? "border-red-500/50 hover:border-red-500 shadow-[0_0_15px_-5px_theme(colors.red.500)]" : "border-[#1e1e2e] hover:border-[#7c3aed]/50"
      }`}
      onClick={() => router.push(`/post/${site}/${service}/${user}/${postId}`)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Aperçu */}
      <div className="relative aspect-square bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
        {type === "video" ? (
          <>
            {showImg ? (
              <img
                src={thumbnailUrl}
                alt={title}
                loading="lazy"
                onError={() => setImgError(true)}
                className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
                  hovered ? "opacity-0" : "opacity-100 group-hover:scale-105"
                }`}
              />
            ) : (
              (!forceVideoStatic || !previewSrc) && (
                <Film className="h-12 w-12 text-[#6b7280] absolute z-0" />
              )
            )}
            {((forceVideoStatic && previewSrc) || (hasHovered && previewSrc)) && (
              <video
                ref={videoRef}
                src={previewSrc}
                muted
                loop
                playsInline
                preload={forceVideoStatic ? "metadata" : "none"}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  (forceVideoStatic || hovered) ? "opacity-100 z-10" : "opacity-0 -z-10"
                }`}
              />
            )}
          </>
        ) : type === "image" ? (
          showImg ? (
            <img
              src={thumbnailUrl}
              alt={title}
              loading="lazy"
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <Image className="h-12 w-12 text-[#6b7280] absolute z-0" />
          )
        ) : (
          <FileText className="h-12 w-12 text-[#6b7280] absolute z-0" />
        )}

        {/* Overlay vidéo */}
        {type === "video" && !hovered && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Play className="h-10 w-10 text-white drop-shadow" />
          </div>
        )}

        {/* Like button top-left — visible si liké ou au survol */}
        <div className={`absolute top-2 left-2 z-20 transition-opacity duration-200 ${liked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePostLike(site, service, user, postId);
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

        {/* Badge type top-right — visible sur l'aperçu */}
        <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
          <div
            className={`p-1.5 rounded-md backdrop-blur-sm ${
              type === "video"
                ? "bg-pink-600/80 text-white"
                : "bg-[#7c3aed]/80 text-white"
            }`}
          >
            {type === "video" ? (
              <Film className="h-4 w-4" />
            ) : type === "text" ? (
              <FileText className="h-4 w-4" />
            ) : (
              <Image className="h-4 w-4" />
            )}
          </div>
        </div>
      </div>

      {/* Texte */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium text-[#f0f0f5] truncate">
          {title || "Sans titre"}
        </h3>
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <Badge variant="outline" className="border-[#1e1e2e] text-[#6b7280] text-xs">
            {service}
          </Badge>
          {publishedAt && (
            <span>
              {new Date(
                typeof publishedAt === "number"
                  ? (publishedAt as number) * 1000
                  : publishedAt
              ).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
