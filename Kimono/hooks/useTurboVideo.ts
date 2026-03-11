import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

interface TurboConfig {
  initialChunkSize?: number;
  maxChunkSize?: number;
  concurrentRequests?: number;
  maxBufferAhead?: number;
  maxRetries?: number;
}

interface ChunkEntry {
  offset: number;
  data: ArrayBuffer;
}

interface UseTurboVideoResult {
  sourceUrl: string;
  isPreloaded: boolean;
  progress: number;
  isLoading: boolean;
  isFallback: boolean;
  playTurbo: () => Promise<void>;
}

export function useTurboVideo(
  originalUrl: string | undefined,
  videoRef: RefObject<HTMLVideoElement | null>,
  config: TurboConfig = {}
): UseTurboVideoResult {
  const {
    initialChunkSize = 512 * 1024,
    maxChunkSize = 4 * 1024 * 1024,
    concurrentRequests = 3,
    maxBufferAhead = 50 * 1024 * 1024,
    maxRetries = 5,
  } = config;

  const [sourceUrl, setSourceUrl] = useState(originalUrl || "");
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const totalSizeRef = useRef<number | null>(null);
  const preloadedChunkRef = useRef<ArrayBuffer | null>(null);
  const nextByteOffsetRef = useRef(0);
  const chunksQueueRef = useRef<ChunkEntry[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const retryTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const clearRetryTimeouts = useCallback(() => {
    retryTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    retryTimeoutsRef.current.clear();
  }, []);

  const cleanupResources = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearRetryTimeouts();
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    totalSizeRef.current = null;
    preloadedChunkRef.current = null;
    nextByteOffsetRef.current = 0;
    chunksQueueRef.current = [];

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, [clearRetryTimeouts]);

  useEffect(() => {
    cleanupResources();
    setSourceUrl(originalUrl || "");
    setIsPreloaded(false);
    setProgress(0);
    setIsLoading(false);
    setIsFallback(false);

    return cleanupResources;
  }, [cleanupResources, originalUrl]);

  const fallbackToNative = useCallback(() => {
    cleanupResources();
    setSourceUrl(originalUrl || "");
    setIsPreloaded(false);
    setProgress(0);
    setIsLoading(false);
    setIsFallback(true);
  }, [cleanupResources, originalUrl]);

  const appendToSourceBuffer = useCallback(async (buffer: ArrayBuffer) => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onUpdateEnd = () => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        resolve();
      };

      const onError = (event: Event) => {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        reject(event);
      };

      sourceBuffer.addEventListener("updateend", onUpdateEnd);
      sourceBuffer.addEventListener("error", onError);

      try {
        sourceBuffer.appendBuffer(buffer);
      } catch (error) {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);
        sourceBuffer.removeEventListener("error", onError);
        reject(error);
      }
    });
  }, []);

  const processQueue = useCallback(async () => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating || chunksQueueRef.current.length === 0) {
      return;
    }

    chunksQueueRef.current.sort((left, right) => left.offset - right.offset);
    const nextChunk = chunksQueueRef.current.shift();
    if (!nextChunk) {
      return;
    }

    try {
      await appendToSourceBuffer(nextChunk.data);
      if (chunksQueueRef.current.length > 0) {
        void processQueue();
      }
    } catch (error) {
      console.error("Erreur durant l'assemblage MSE :", error);
      fallbackToNative();
    }
  }, [appendToSourceBuffer, fallbackToNative]);

  const fetchChunk = useCallback(
    async (start: number, end: number, attempt = 1): Promise<ArrayBuffer> => {
      if (!originalUrl) {
        throw new Error("Missing video source URL");
      }

      try {
        const response = await fetch(originalUrl, {
          headers: { Range: `bytes=${start}-${end}` },
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          if (response.status >= 500 && response.status <= 504) {
            throw new Error(`Cold Storage Error: HTTP ${response.status}`);
          }
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.arrayBuffer();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt - 1) * 1000;
          console.warn(
            `Cold storage detecte pour le chunk ${start}-${end}, retry ${attempt}/${maxRetries} dans ${waitTime}ms...`
          );

          await new Promise<void>((resolve) => {
            const timeoutId = setTimeout(() => {
              retryTimeoutsRef.current.delete(timeoutId);
              resolve();
            }, waitTime);
            retryTimeoutsRef.current.add(timeoutId);
          });

          return fetchChunk(start, end, attempt + 1);
        }

        throw error;
      }
    },
    [maxRetries, originalUrl]
  );

  const startParallelWorkers = useCallback(() => {
    const totalSize = totalSizeRef.current;
    if (!totalSize) {
      return;
    }

    const signal = abortControllerRef.current?.signal;
    let activeRequests = 0;
    let hasFailed = false;
    let currentChunkSize = initialChunkSize;

    const queueWorker = (worker: () => Promise<void>) => {
      const timeoutId = setTimeout(() => {
        retryTimeoutsRef.current.delete(timeoutId);
        void worker();
      }, 1000);
      retryTimeoutsRef.current.add(timeoutId);
    };

    const worker = async () => {
      const videoElement = videoRef.current;
      if (videoElement && totalSizeRef.current) {
        const bytesPlayed =
          videoElement.duration > 0
            ? (videoElement.currentTime / videoElement.duration) * totalSizeRef.current
            : 0;
        const bufferedAhead = nextByteOffsetRef.current - bytesPlayed;

        if (bufferedAhead > maxBufferAhead) {
          queueWorker(worker);
          return;
        }
      }

      if (hasFailed || nextByteOffsetRef.current >= totalSize || signal?.aborted) {
        return;
      }

      activeRequests += 1;
      const start = nextByteOffsetRef.current;
      const end = Math.min(start + currentChunkSize - 1, totalSize - 1);
      nextByteOffsetRef.current = end + 1;

      if (currentChunkSize < maxChunkSize) {
        currentChunkSize = Math.min(currentChunkSize * 2, maxChunkSize);
      }

      try {
        const buffer = await fetchChunk(start, end);
        chunksQueueRef.current.push({ offset: start, data: buffer });
        setProgress((Math.min(totalSize, nextByteOffsetRef.current) / totalSize) * 100);
        void processQueue();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error(
          `Erreur fatale telechargement chunk ${start}-${end} apres ${maxRetries} tentatives`,
          error
        );
        hasFailed = true;
        fallbackToNative();
      } finally {
        activeRequests -= 1;

        if (!hasFailed && nextByteOffsetRef.current < totalSize) {
          void worker();
        } else if (
          activeRequests === 0 &&
          !hasFailed &&
          mediaSourceRef.current?.readyState === "open"
        ) {
          mediaSourceRef.current.endOfStream();
          setProgress(100);
        }
      }
    };

    for (let index = 0; index < concurrentRequests; index += 1) {
      void worker();
    }
  }, [
    concurrentRequests,
    fetchChunk,
    fallbackToNative,
    initialChunkSize,
    maxBufferAhead,
    maxChunkSize,
    maxRetries,
    processQueue,
    videoRef,
  ]);

  const preloadFirstChunk = useCallback(async () => {
    if (!originalUrl || isFallback || isPreloaded) {
      return;
    }

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch(originalUrl, {
        headers: { Range: `bytes=0-${initialChunkSize - 1}` },
        signal: abortControllerRef.current.signal,
      });

      if (response.status !== 206) {
        fallbackToNative();
        return;
      }

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
      setIsPreloaded(true);
      setProgress(
        totalSizeRef.current ? (buffer.byteLength / totalSizeRef.current) * 100 : 0
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        console.warn("Prechargement echoue, fallback vers mode classique");
        fallbackToNative();
      }
    }
  }, [fallbackToNative, initialChunkSize, isFallback, isPreloaded, originalUrl]);

  useEffect(() => {
    if (!originalUrl || isFallback || isPreloaded || !videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void preloadFirstChunk();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(videoElement);
    return () => observer.disconnect();
  }, [isFallback, isPreloaded, originalUrl, preloadFirstChunk, videoRef]);

  const playTurbo = useCallback(async () => {
    if (isFallback || isLoading || !originalUrl || !totalSizeRef.current || objectUrlRef.current) {
      return;
    }

    const mimeCodec = 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"';
    if (!window.MediaSource || !MediaSource.isTypeSupported(mimeCodec)) {
      console.warn("MediaSource / codec non supporte, fallback natif.");
      fallbackToNative();
      return;
    }

    setIsLoading(true);

    try {
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      const objectUrl = URL.createObjectURL(mediaSource);
      objectUrlRef.current = objectUrl;
      setSourceUrl(objectUrl);

      await new Promise<void>((resolve) => {
        mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
      });

      const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
      sourceBuffer.mode = "sequence";
      sourceBufferRef.current = sourceBuffer;

      if (preloadedChunkRef.current) {
        await appendToSourceBuffer(preloadedChunkRef.current);
      }

      startParallelWorkers();
      setIsLoading(false);
    } catch (error) {
      console.error("MSE initialization failed", error);
      fallbackToNative();
    }
  }, [
    appendToSourceBuffer,
    fallbackToNative,
    isFallback,
    isLoading,
    originalUrl,
    startParallelWorkers,
  ]);

  return {
    sourceUrl,
    isPreloaded,
    progress,
    isLoading,
    isFallback,
    playTurbo,
  };
}