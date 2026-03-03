import { useState, useEffect } from "react";

// Cache global persistant entre montages/démontages pour éviter des requêtes répétées
const thumbnailCache = new Map<string, string>();

/**
 * Proxifie une URL de thumbnail CDN (img.coomer.st / img.kemono.cr) à travers /api/thumbnail
 * pour contourner les restrictions CORS côté client.
 *
 * @param cdnUrl - URL thumbnail CDN directe (ex: https://img.coomer.st/thumbnail/data/...)
 * @returns { thumbnailUrl, loading }
 */
export function useServerThumbnail(cdnUrl: string | undefined): {
  thumbnailUrl: string | null;
  loading: boolean;
} {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(() => {
    if (cdnUrl && thumbnailCache.has(cdnUrl)) return thumbnailCache.get(cdnUrl)!;
    return null;
  });

  const [loading, setLoading] = useState<boolean>(
    () => !!cdnUrl && !thumbnailCache.has(cdnUrl)
  );

  useEffect(() => {
    if (!cdnUrl) {
      setThumbnailUrl(null);
      setLoading(false);
      return;
    }

    if (thumbnailCache.has(cdnUrl)) {
      setThumbnailUrl(thumbnailCache.get(cdnUrl)!);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setThumbnailUrl(null);

    async function fetchThumbnail() {
      try {
        // Passe l'URL CDN à travers notre proxy qui ajoute les bons headers Referer
        const proxyUrl = `/api/thumbnail?url=${encodeURIComponent(cdnUrl!)}`;
        const res = await fetch(proxyUrl, { signal: abortController.signal });

        if (!res.ok) throw new Error(`Proxy returned ${res.status}`);

        const blob = await res.blob();
        if (abortController.signal.aborted) return;

        const objectUrl = URL.createObjectURL(blob);
        thumbnailCache.set(cdnUrl!, objectUrl);
        setThumbnailUrl(objectUrl);
      } catch (err: unknown) {
        // Ignore les AbortError (composant démonté avant la fin du fetch)
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[useServerThumbnail] Failed:", (err as Error).message);
          setThumbnailUrl(null);
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    }

    fetchThumbnail();

    // Annule la requête en vol si le composant est démonté
    return () => abortController.abort();
  }, [cdnUrl]);

  return { thumbnailUrl, loading };
}
