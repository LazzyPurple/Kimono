"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FileText, Film, Heart, Image as ImageIcon, Play } from "lucide-react";
import type { Site } from "@/lib/api/helpers";
import { useLikes } from "@/contexts/LikesContext";

interface MediaCardProps {
  title: string;
  previewImageUrl?: string;
  videoUrl?: string;
  type?: "image" | "video" | "text";
  site: Site;
  service: string;
  postId: string;
  user: string;
  publishedAt?: string | number;
  videoPreviewMode?: "hover" | "viewport";
}

export default function MediaCard({
  title,
  previewImageUrl,
  videoUrl,
  type = "image",
  site,
  service,
  postId,
  user,
  publishedAt,
  videoPreviewMode = "hover",
}: MediaCardProps) {
  const [hovered, setHovered] = useState(false);
  const [hasHovered, setHasHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [shouldWarmVideo, setShouldWarmVideo] = useState(false);

  const cardRef = useRef<HTMLAnchorElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(hovered);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | undefined>(undefined);

  const { isPostLiked, togglePostLike } = useLikes();
  const liked = isPostLiked(site, service, postId);
  const showImage = Boolean(previewImageUrl) && !imgError;

  useEffect(() => {
    if (videoPreviewMode !== "viewport" || !videoUrl || !cardRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldWarmVideo(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "320px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [videoPreviewMode, videoUrl]);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHovered(true);
      setHasHovered(true);
      setShouldWarmVideo(true);
    }, 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    setHovered(false);
  }, []);

  const shouldMountVideo =
    type === "video" &&
    Boolean(videoUrl) &&
    (hasHovered || shouldWarmVideo || (!showImage && videoPreviewMode === "viewport"));

  useEffect(() => {
    isHoveredRef.current = hovered;

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (hovered) {
      playPromiseRef.current = video.play();
      playPromiseRef.current?.catch(() => {});
      return;
    }

    if (playPromiseRef.current) {
      playPromiseRef.current
        .then(() => {
          if (!isHoveredRef.current) {
            video.pause();
            video.currentTime = 0;
          }
        })
        .catch(() => {});
      return;
    }

    video.pause();
    video.currentTime = 0;
  }, [hovered, shouldMountVideo]);

  const shouldShowVideo = shouldMountVideo && (!showImage || hovered);
  const videoPreload = videoPreviewMode === "viewport" || !showImage ? "metadata" : "none";

  return (
    <a
      ref={cardRef}
      href={`/post/${site}/${service}/${user}/${postId}`}
      className={`block overflow-hidden rounded-xl border bg-[#12121a] transition-all duration-300 group cursor-pointer ${
        liked
          ? "border-red-500/50 shadow-[0_0_15px_-5px_theme(colors.red.500)] hover:border-red-500"
          : "border-[#1e1e2e] hover:border-[#7c3aed]/50"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative aspect-square overflow-hidden bg-[#0a0a0f] flex items-center justify-center">
        {type === "video" ? (
          <>
            {showImage ? (
              <img
                src={previewImageUrl}
                alt={title}
                loading="lazy"
                decoding="async"
                onError={() => setImgError(true)}
                className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-300 ${
                  hovered ? "scale-105 opacity-0" : "opacity-100 group-hover:scale-105"
                }`}
              />
            ) : !shouldMountVideo ? (
              <Film className="absolute z-0 h-12 w-12 text-[#6b7280]" />
            ) : null}

            {shouldMountVideo && videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                loop
                playsInline
                preload={videoPreload}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  shouldShowVideo ? "z-10 opacity-100" : "-z-10 opacity-0"
                }`}
              />
            ) : null}
          </>
        ) : type === "image" ? (
          showImage ? (
            <img
              src={previewImageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <ImageIcon className="absolute z-0 h-12 w-12 text-[#6b7280]" />
          )
        ) : (
          <FileText className="absolute z-0 h-12 w-12 text-[#6b7280]" />
        )}

        {type === "video" && !hovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Play className="h-10 w-10 text-white drop-shadow" />
          </div>
        )}

        <div className={`absolute top-2 left-2 z-20 transition-opacity duration-200 ${liked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              togglePostLike(site, service, user, postId);
            }}
            className="cursor-pointer rounded-full bg-black/40 p-1.5 transition-colors hover:bg-black/60"
          >
            <Heart
              className={`h-4 w-4 transition-colors ${liked ? "fill-red-500 text-red-500" : "text-white/80"}`}
            />
          </button>
        </div>

        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          <div
            className={`rounded-md p-1.5 backdrop-blur-sm ${
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
              <ImageIcon className="h-4 w-4" />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1 p-3">
        <h3 className="truncate text-sm font-medium text-[#f0f0f5]">
          {title || "Sans titre"}
        </h3>
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <Badge variant="outline" className="border-[#1e1e2e] text-xs text-[#6b7280]">
            {service}
          </Badge>
          {publishedAt && (
            <span>
              {new Date(typeof publishedAt === "number" ? publishedAt * 1000 : publishedAt).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}