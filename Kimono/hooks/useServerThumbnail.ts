import { useState, useEffect } from "react";

// Cache global préservé lors des démontages pour éviter de spammer le serveur/FFMPEG
const thumbnailCache = new Map<string, string>();

export function useServerThumbnail(videoUrl: string | undefined): {
  thumbnailUrl: string | null;
  loading: boolean;
} {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(() => {
    if (videoUrl && thumbnailCache.has(videoUrl)) {
      return thumbnailCache.get(videoUrl)!;
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    return !!videoUrl && !thumbnailCache.has(videoUrl);
  });

  useEffect(() => {
    if (!videoUrl) {
      setThumbnailUrl(null);
      setLoading(false);
      return;
    }

    if (thumbnailCache.has(videoUrl)) {
      setThumbnailUrl(thumbnailCache.get(videoUrl)!);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setThumbnailUrl(null);

    async function fetchThumbnail() {
      try {
        const res = await fetch(
          `/api/thumbnail?url=${encodeURIComponent(videoUrl!)}`,
          {
            signal: abortController.signal,
          }
        );

        if (!res.ok) {
          throw new Error("Failed to fetch thumbnail");
        }

        const blob = await res.blob();
        if (abortController.signal.aborted) return;
        
        const objectUrl = URL.createObjectURL(blob);
        
        thumbnailCache.set(videoUrl!, objectUrl);
        setThumbnailUrl(objectUrl);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("useServerThumbnail error:", err);
          setThumbnailUrl(null);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchThumbnail();

    return () => {
      // Abort la requête de fetch (le backend next saura potentiellement couper short le stream)
      abortController.abort();
    };
  }, [videoUrl]);

  return { thumbnailUrl, loading };
}
