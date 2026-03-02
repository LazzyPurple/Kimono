"use client";

import { useState, useEffect } from "react";

export function useVideoThumbnail(videoUrl: string | undefined): { thumbnailDataUrl: string | null } {
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    let cancelled = false;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    video.src = videoUrl;

    video.addEventListener("loadeddata", () => {
      video.currentTime = 1;
    });

    video.addEventListener("seeked", () => {
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        try {
          setThumbnailDataUrl(canvas.toDataURL("image/jpeg", 0.8));
        } catch {
          /* canvas tainted, CORS bloqué */
        }
      }

      video.src = "";
    });

    video.addEventListener("error", () => {
      /* ne rien faire */
    });

    video.load();

    return () => {
      cancelled = true;
      video.src = "";
    };
  }, [videoUrl]);

  return { thumbnailDataUrl };
}
