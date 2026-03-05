import { useState, useEffect, useRef, useCallback } from "react";

interface TurboConfig {
  initialChunkSize?: number; // 512Ko pour un démarrage instantané
  maxChunkSize?: number; // 4Mo max pour la vitesse de croisière
  concurrentRequests?: number; // 3 requêtes max
  maxBufferAhead?: number; // 50Mo d'avance maximum en RAM
  maxRetries?: number; // Nombre de tentatives en cas d'erreur serveur (Cold Storage)
}

interface TurboState {
  src: string;
  isPreloaded: boolean;
  progress: number; // 0 à 100
  loading: boolean;
  isFallback: boolean; // True si on tombe sur le chargement classique (serveur ne supporte pas Range)
}

export function useTurboVideo(
  originalUrl: string | undefined,
  config: TurboConfig = {}
) {
  const { 
    initialChunkSize = 512 * 1024, 
    maxChunkSize = 4 * 1024 * 1024,
    concurrentRequests = 3,
    maxBufferAhead = 50 * 1024 * 1024,
    maxRetries = 5 
  } = config;

  const videoRef = useRef<HTMLVideoElement>(null);

  const [state, setState] = useState<TurboState>({
    src: originalUrl || "",
    isPreloaded: false,
    progress: 0,
    loading: false,
    isFallback: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  // État interne pour la progression du téléchargement
  const totalSizeRef = useRef<number | null>(null);
  const preloadedChunkRef = useRef<ArrayBuffer | null>(null);
  const nextByteOffsetRef = useRef<number>(0);
  const chunksQueueRef = useRef<{ offset: number; data: ArrayBuffer }[]>([]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (state.src.startsWith("blob:")) {
        URL.revokeObjectURL(state.src);
      }
    };
  }, [state.src]);

  // Fallback classique si les requêtes Range échouent ou si MSE n'est pas supporté
  const fallbackToNative = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setState((s) => ({
      ...s,
      src: originalUrl || "",
      isFallback: true,
      loading: false,
    }));
  }, [originalUrl]);

  // Préchargement avec Intersection Observer
  useEffect(() => {
    if (!originalUrl || state.isFallback || state.isPreloaded) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          preloadFirstChunk();
          observer.disconnect(); // On ne précharge qu'une fois
        }
      },
      { threshold: 0.1 }
    );

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUrl, state.isFallback, state.isPreloaded]);

  const preloadFirstChunk = async () => {
    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch(originalUrl!, {
        headers: { Range: `bytes=0-${initialChunkSize - 1}` },
        signal: abortControllerRef.current.signal,
      });

      // Si le serveur renvoie 200 au lieu de 206, il ne supporte pas les Range requests
      if (response.status !== 206) {
        return fallbackToNative();
      }

      // Récupérer la taille totale de la vidéo
      const contentRange = response.headers.get("content-range");
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)/);
        if (match) {
          totalSizeRef.current = parseInt(match[1], 10);
        }
      }

      const buffer = await response.arrayBuffer();
      preloadedChunkRef.current = buffer;
      nextByteOffsetRef.current = buffer.byteLength;

      setState((s) => ({
        ...s,
        isPreloaded: true,
        progress: totalSizeRef.current
          ? (buffer.byteLength / totalSizeRef.current) * 100
          : 0,
      }));
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.warn("Préchargement échoué, fallback vers mode classique");
        fallbackToNative();
      }
    }
  };

  /**
   * Ajoute un buffer dans le MediaSource de façon asynchrone pour respecter le flux
   */
  const appendToSourceBuffer = async (buffer: ArrayBuffer) => {
    const sb = sourceBufferRef.current;
    if (!sb) return;

    return new Promise<void>((resolve, reject) => {
      const onUpdateEnd = () => {
        sb.removeEventListener("updateend", onUpdateEnd);
        sb.removeEventListener("error", onError);
        resolve();
      };
      const onError = (e: Event) => {
        sb.removeEventListener("updateend", onUpdateEnd);
        sb.removeEventListener("error", onError);
        reject(e);
      };

      sb.addEventListener("updateend", onUpdateEnd);
      sb.addEventListener("error", onError);

      try {
        sb.appendBuffer(buffer);
      } catch (e) {
        reject(e);
      }
    });
  };

  /**
   * Gère la boucle de lecture de la queue pour garantir que les chunks
   * soient ajoutés au SourceBuffer dans le bon ordre (MSE exige l'ordre strict avec 'sequence' ou timestamp)
   */
  const processQueue = async () => {
    if (chunksQueueRef.current.length === 0 || !sourceBufferRef.current) return;
    if (sourceBufferRef.current.updating) return;

    // Trier les chunks par offset et prendre le premier
    chunksQueueRef.current.sort((a, b) => a.offset - b.offset);
    const nextChunk = chunksQueueRef.current.shift();

    if (nextChunk) {
      try {
        await appendToSourceBuffer(nextChunk.data);
        if (chunksQueueRef.current.length > 0) {
          processQueue();
        }
      } catch (e) {
        console.error("Erreur durant l'assemblage MSE :", e);
        fallbackToNative();
      }
    }
  };

  /**
   * Action appelée au clic sur "Play"
   */
  const playTurbo = async () => {
    // Si fallback déjà actif, on a rien à faire, la balise <video> classique prend le relais
    if (state.isFallback || !originalUrl || !totalSizeRef.current) return;

    // Vérifier support MSE (généralement video/mp4 avec codecs H264/AAC standard)
    const mimeCodec = 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"';
    if (!window.MediaSource || !MediaSource.isTypeSupported(mimeCodec)) {
      console.warn("MediaSource / codec non supporté, fallback natif.");
      return fallbackToNative();
    }

    setState((s) => ({ ...s, loading: true }));

    try {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      const objectUrl = URL.createObjectURL(ms);
      
      // Injecter la fausse URL blob: dans la balise vidéo
      setState((s) => ({ ...s, src: objectUrl }));

      await new Promise<void>((resolve) => {
        ms.addEventListener(
          "sourceopen",
          () => {
            resolve();
          },
          { once: true }
        );
      });

      const sb = ms.addSourceBuffer(mimeCodec);
      // 'sequence' permet au navigateur de coller les segments vidéos de bout en bout
      // même si on ne fournit pas les timestamps exacts du fMP4 manuel
      sb.mode = "sequence";
      sourceBufferRef.current = sb;

      // Ajouter le segment préchargé d'abord
      if (preloadedChunkRef.current) {
        await appendToSourceBuffer(preloadedChunkRef.current);
      }

      // Démarrer les workers parallèles pour la suite
      startParallelWorkers();

    } catch (e) {
      console.error("MSE initialization failed", e);
      fallbackToNative();
    }
  };

  const fetchChunk = async (start: number, end: number, attempt = 1): Promise<ArrayBuffer> => {
    try {
      const res = await fetch(originalUrl!, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: abortControllerRef.current?.signal,
      });

      if (!res.ok) {
        // Erreurs 502/503/504 typiques d'un serveur object storage en réveil (Cold Storage)
        if (res.status >= 500 && res.status <= 504) {
          throw new Error(`Cold Storage Error: HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error; // L'annulation via AbortController n'est pas une vraie erreur réseau
      }
      if (attempt < maxRetries) {
        // Backoff exponentiel : 1s, 2s, 4s, 8s, 16s
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`Cold storage detecté pour le chunk ${start}-${end}, retry ${attempt}/${maxRetries} dans ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        return fetchChunk(start, end, attempt + 1);
      }
      throw error;
    }
  };

  const startParallelWorkers = () => {
    const totalSize = totalSizeRef.current!;
    const signal = abortControllerRef.current?.signal;

    let activeRequests = 0;
    let hasFailed = false;
    let currentChunkSize = initialChunkSize;

    const worker = async () => {
      // Pause si on a trop d'avance en mémoire pour soulager la RAM et la bande passante
      if (videoRef.current && totalSizeRef.current) {
        const bytesPlayed = (videoRef.current.currentTime / videoRef.current.duration) * totalSizeRef.current || 0;
        const bufferedAhead = nextByteOffsetRef.current - bytesPlayed;
        
        if (bufferedAhead > maxBufferAhead) {
          // Attendre 1 seconde avant de revérifier
          setTimeout(worker, 1000);
          return;
        }
      }

      if (hasFailed || nextByteOffsetRef.current >= totalSize || signal?.aborted) {
        return;
      }

      activeRequests++;
      
      const start = nextByteOffsetRef.current;
      const end = Math.min(start + currentChunkSize - 1, totalSize - 1);
      nextByteOffsetRef.current = end + 1;

      // Augmentation progressive de la taille des chunks (TCP Slow Start style)
      if (currentChunkSize < maxChunkSize) {
        currentChunkSize = Math.min(currentChunkSize * 2, maxChunkSize);
      }

      try {
        const buffer = await fetchChunk(start, end);
        chunksQueueRef.current.push({ offset: start, data: buffer });
        
        const loadedBytes = nextByteOffsetRef.current; 
        setState((s) => ({ ...s, progress: (loadedBytes / totalSize) * 100 }));

        processQueue();

      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // Annulation normale
        console.error(`Erreur fatale téléchargement chunk ${start}-${end} après ${maxRetries} tentatives`, e);
        hasFailed = true;
        fallbackToNative();
      } finally {
        activeRequests--;
        
        if (!hasFailed && nextByteOffsetRef.current < totalSize) {
          worker();
        } else if (activeRequests === 0 && !hasFailed && mediaSourceRef.current?.readyState === "open") {
          mediaSourceRef.current.endOfStream();
          setState((s) => ({ ...s, loading: false }));
        }
      }
    };

    for (let i = 0; i < concurrentRequests; i++) {
      worker();
    }
  };

  return { videoRef, state, playTurbo };
}
