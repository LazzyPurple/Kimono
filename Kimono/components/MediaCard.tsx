"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock3, FileText, Film, Heart, Image as ImageIcon, Play } from "lucide-react";
import type { Site } from "@/lib/api/helpers";
import { useLikes } from "@/contexts/LikesContext";
import {
  formatVideoDurationLabel,
  pickLongestVideoDuration,
} from "@/lib/media-card-utils";
import {
  getDefaultVideoPreviewCache,
  markVideoPreviewWarm,
  readVideoPreviewState,
  rememberVideoPreviewDuration,
} from "@/lib/video-preview-cache";

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
  videoPreviewMode?: "hover" | "viewport";
  priority?: boolean;
}

const videoDurationCache = new Map<string, number | null>();

function readVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finalize = (duration: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      video.removeAttribute("src");
      video.load();
      resolve(duration);
    };

    const timeout = window.setTimeout(() => finalize(null), 12000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      finalize(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      finalize(null);
    };
    video.src = url;
  });
}

function formatPublishedDate(publishedAt?: string | number): string | null {
  if (!publishedAt) {
    return null;
  }

  const date = new Date(typeof publishedAt === "number" ? publishedAt * 1000 : publishedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-GB");
}

export default function MediaCard({
  title,
  previewImageUrl,
  videoUrl,
  videoCandidates,
  type = "image",
  site,
  service,
  postId,
  user,
  publishedAt,
  durationSeconds = null,
  videoPreviewMode = "hover",
  priority = false,
}: MediaCardProps) {
  const [hovered, setHovered] = useState(false);
  const [hasHovered, setHasHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [shouldWarmVideo, setShouldWarmVideo] = useState(false);
  const [durationLabel, setDurationLabel] = useState<string | null>(null);

  const cardRef = useRef<HTMLAnchorElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(hovered);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const previewCacheRef = useRef(getDefaultVideoPreviewCache());

  const { isPostLiked, togglePostLike } = useLikes();
  const liked = isPostLiked(site, service, postId);
  const showImage = Boolean(previewImageUrl) && !imgError;
  const publishedLabel = formatPublishedDate(publishedAt);
  const resolvedVideoCandidates = Array.from(
    new Set((videoCandidates?.length ? videoCandidates : videoUrl ? [videoUrl] : []).filter(Boolean))
  ) as string[];

  useEffect(() => {
    if (type !== "video" || resolvedVideoCandidates.length === 0) {
      setDurationLabel(null);
      setShouldWarmVideo(false);
      return;
    }

    let cancelled = false;
    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cachedDurations: Array<number | null | undefined> = [];
    let hasCachedWarmPreview = false;

    for (const candidateUrl of resolvedVideoCandidates) {
      if (durationSeconds != null) {
        cachedDurations.push(durationSeconds);
        continue;
      }

      const cachedState = readVideoPreviewState(previewCacheRef.current, candidateUrl);
      if (!cachedState) {
        cachedDurations.push(undefined);
        continue;
      }

      if (cachedState.durationSeconds != null) {
        videoDurationCache.set(candidateUrl, cachedState.durationSeconds);
      }

      cachedDurations.push(cachedState.durationSeconds);
      hasCachedWarmPreview = hasCachedWarmPreview || cachedState.warmed;
    }

    setDurationLabel(formatVideoDurationLabel(durationSeconds ?? pickLongestVideoDuration(cachedDurations)));

    const canWarmInBackground = videoPreviewMode === "viewport" || !showImage;

    if (hasCachedWarmPreview && canWarmInBackground) {
      setShouldWarmVideo(true);
    }

    if (!canWarmInBackground) {
      return () => {
        cancelled = true;
      };
    }

    const warmSoon = () => {
      if (!cancelled) {
        setShouldWarmVideo(true);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(warmSoon, { timeout: 900 });
    } else {
      timeoutId = setTimeout(warmSoon, 180);
    }

    return () => {
      cancelled = true;

      if (idleCallbackId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [durationSeconds, resolvedVideoCandidates, showImage, type, videoPreviewMode]);

  useEffect(() => {
    if (type !== "video" || videoPreviewMode !== "viewport" || !videoUrl || !cardRef.current) {
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
        rootMargin: "1200px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [type, videoPreviewMode, videoUrl]);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHovered(true);
      setHasHovered(true);
      setShouldWarmVideo(true);
    }, 120);
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
    (
      hasHovered ||
      (videoPreviewMode === "viewport" && (shouldWarmVideo || !showImage)) ||
      (!showImage && shouldWarmVideo)
    );

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

  useEffect(() => {
    if (type !== "video") {
      setDurationLabel(null);
      return;
    }

    const longestKnownDuration = durationSeconds ?? pickLongestVideoDuration(
      resolvedVideoCandidates.map((url) => videoDurationCache.get(url))
    );
    setDurationLabel(formatVideoDurationLabel(longestKnownDuration));

    if (durationSeconds != null || resolvedVideoCandidates.length === 0 || !(shouldWarmVideo || shouldMountVideo || hovered)) {
      return;
    }

    const unresolvedUrls = resolvedVideoCandidates.filter((url) => !videoDurationCache.has(url));
    if (unresolvedUrls.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      unresolvedUrls.map(async (url) => {
        const duration = await readVideoDuration(url);
        videoDurationCache.set(url, duration);
        rememberVideoPreviewDuration(previewCacheRef.current, url, duration);

        if (duration != null) {
          markVideoPreviewWarm(previewCacheRef.current, url);
        }
      })
    ).then(() => {
      if (cancelled) {
        return;
      }

      const nextDuration = pickLongestVideoDuration(
        resolvedVideoCandidates.map((url) => videoDurationCache.get(url))
      );
      setDurationLabel(formatVideoDurationLabel(nextDuration));
    });

    return () => {
      cancelled = true;
    };
  }, [durationSeconds, hovered, resolvedVideoCandidates, shouldMountVideo, shouldWarmVideo, type]);

  const handleVideoReady = useCallback(() => {
    if (!videoUrl) {
      return;
    }

    markVideoPreviewWarm(previewCacheRef.current, videoUrl);

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : null;
    if (duration != null) {
      videoDurationCache.set(videoUrl, duration);
      rememberVideoPreviewDuration(previewCacheRef.current, videoUrl, duration);
      if (durationSeconds == null) {
        setDurationLabel((currentLabel) => currentLabel ?? formatVideoDurationLabel(duration));
      }
    }
  }, [durationSeconds, videoUrl]);

  const shouldShowVideo = shouldMountVideo && (!showImage || hovered);
  const videoPreload = shouldWarmVideo ? ((videoPreviewMode === "viewport" || !showImage) ? "auto" : "metadata") : (videoPreviewMode === "viewport" || !showImage ? "metadata" : "none");

  return (
    <a
      ref={cardRef}
      href={`/post/${site}/${service}/${user}/${postId}`}
      className={`group block overflow-hidden rounded-xl border bg-[#12121a] transition-all duration-300 cursor-pointer ${
        liked
          ? "border-red-500/50 shadow-[0_0_15px_-5px_theme(colors.red.500)] hover:border-red-500"
          : "border-[#1e1e2e] hover:border-[#7c3aed]/50"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#0a0a0f]">
        {type === "video" ? (
          <>
            {showImage ? (
              <img
                src={previewImageUrl}
                alt={title}
                loading={priority ? undefined : "lazy"}
                fetchPriority={priority ? "high" : undefined}
                decoding="async"
                referrerPolicy="no-referrer"
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
                onLoadedData={handleVideoReady}
                onCanPlay={handleVideoReady}
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
              loading={priority ? undefined : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              referrerPolicy="no-referrer"
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

        <div className={`absolute left-2 top-2 z-20 transition-opacity duration-200 ${liked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
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

        <div className="absolute right-2 top-2 z-20 flex flex-col items-end gap-2">
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

          {durationLabel && (
            <div className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{durationLabel}</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        <h3 className="min-h-[2.5rem] break-words text-sm font-medium leading-tight text-[#f0f0f5]">
          {title || "Untitled"}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6b7280]">
          <Badge variant="outline" className="border-[#1e1e2e] text-xs text-[#6b7280]">
            {service}
          </Badge>
          {publishedLabel && <span className="rounded-full border border-[#1e1e2e] bg-[#0a0a0f] px-2 py-1">{publishedLabel}</span>}
          {type === "video" && resolvedVideoCandidates.length > 1 && (
            <span className="rounded-full border border-[#1e1e2e] bg-[#0a0a0f] px-2 py-1">
              {resolvedVideoCandidates.length} videos
            </span>
          )}
        </div>
      </div>
    </a>
  );
}







