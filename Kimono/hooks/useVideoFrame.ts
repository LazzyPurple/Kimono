import { useState, useEffect, useRef } from "react";

// Cache global pour éviter de recapturer la même frame plusieurs fois
const frameCache = new Map<string, string>();

/**
 * Extrait une frame statique d'une vidéo côté client.
 *
 * Stratégie : on crée un <video> caché, on charge les métadonnées (preload=metadata),
 * on seeke à seekTime secondes, et on dessine la frame sur un <canvas> pour obtenir un dataURL.
 *
 * ⚠ Pour que canvas.drawImage() fonctionne sans erreur "tainted canvas",
 * la vidéo doit avoir les headers CORS appropriés (Access-Control-Allow-Origin).
 * Si la vidéo bloque le canvas, on retourne null — la card affichera l'icône générique.
 */
export function useVideoFrame(
  videoUrl: string | undefined,
  seekTime: number = 2
): { frameUrl: string | null; loading: boolean } {
  const [frameUrl, setFrameUrl] = useState<string | null>(() =>
    videoUrl && frameCache.has(videoUrl) ? frameCache.get(videoUrl)! : null
  );
  const [loading, setLoading] = useState(() => !!videoUrl && !frameCache.has(videoUrl));
  const abortRef = useRef(false);

  useEffect(() => {
    if (!videoUrl) {
      setFrameUrl(null);
      setLoading(false);
      return;
    }

    if (frameCache.has(videoUrl)) {
      setFrameUrl(frameCache.get(videoUrl)!);
      setLoading(false);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setFrameUrl(null);

    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous"; // Requis pour canvas.drawImage sans tainted canvas

    const cleanup = () => {
      video.src = "";
      video.load();
    };

    video.addEventListener("loadedmetadata", () => {
      if (abortRef.current) { cleanup(); return; }
      // Seek à seekTime (ou à 5% de la durée si la vidéo est courte)
      video.currentTime = Math.min(seekTime, video.duration * 0.05);
    });

    video.addEventListener("seeked", () => {
      if (abortRef.current) { cleanup(); return; }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 480;
        canvas.height = video.videoHeight || 270;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        frameCache.set(videoUrl, dataUrl);
        if (!abortRef.current) setFrameUrl(dataUrl);
      } catch (err) {
        // CORS tainted canvas — on retourne null, la card affichera l'icône générique
        console.warn("[useVideoFrame] Canvas tainted (CORS):", (err as Error).message);
        if (!abortRef.current) setFrameUrl(null);
      } finally {
        cleanup();
        if (!abortRef.current) setLoading(false);
      }
    });

    video.addEventListener("error", () => {
      if (!abortRef.current) {
        setFrameUrl(null);
        setLoading(false);
      }
      cleanup();
    });

    video.load();

    return () => {
      abortRef.current = true;
      cleanup();
    };
  }, [videoUrl, seekTime]);

  return { frameUrl, loading };
}
