"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Download,
  Loader2,
  Maximize,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCwSquare,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTurboVideo } from "@/hooks/useTurboVideo";
import {
  formatPlayerTime,
  getEffectiveDuration,
  getPointerRatio,
  getVideoAreaAction,
} from "@/lib/video-player-utils";

interface VideoPlayerSource {
  site: "kemono" | "coomer";
  service: string;
  creatorId: string;
  postId: string;
  path: string;
  sourceFingerprint: string;
  upstreamUrl: string;
  localStreamUrl: string | null;
  localSourceAvailable: boolean;
  sourceCacheStatus: string | null;
}

interface VideoPlayerProps {
  source: VideoPlayerSource;
  poster?: string;
  filename?: string;
  className?: string;
  turboEnabled?: boolean;
}

interface WarmResponse {
  path: string;
  sourceFingerprint: string;
  upstreamUrl: string;
  localSourceAvailable: boolean;
  sourceCacheStatus: string | null;
  localStreamUrl: string | null;
}

function isDocumentVisible(): boolean {
  if (typeof document === "undefined") {
    return true;
  }

  return document.visibilityState !== "hidden";
}

function describeVideoError(code?: number): string {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Playback was interrupted.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Network error while loading the video.";
    case MediaError.MEDIA_ERR_DECODE:
      return "This video could not be decoded by the browser.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This video source is not supported.";
    default:
      return "Video playback failed.";
  }
}

export default function VideoPlayer({
  source,
  poster,
  filename,
  className = "",
  turboEnabled = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);
  const pendingResumeTimeRef = useRef<number | null>(null);
  const pendingPlayAfterSwitchRef = useRef(false);
  const warmPromiseRef = useRef<Promise<string | null> | null>(null);
  const warmAbortControllerRef = useRef<AbortController | null>(null);
  const warmChannelRef = useRef<BroadcastChannel | null>(null);
  const activeSourceUrlRef = useRef(source.localStreamUrl ?? source.upstreamUrl);
  const isTogglingRef = useRef(false);

  const [activeSourceUrl, setActiveSourceUrl] = useState(source.localStreamUrl ?? source.upstreamUrl);
  const [localStreamUrl, setLocalStreamUrl] = useState(source.localStreamUrl);
  const [localSourceAvailable, setLocalSourceAvailable] = useState(source.localSourceAvailable);
  const [sourceCacheStatus, setSourceCacheStatus] = useState(source.sourceCacheStatus);
  const [isWarmingLocal, setIsWarmingLocal] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(isDocumentVisible);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [rotation, setRotation] = useState(0);
  const [vpFullscreen, setVpFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [volumeScrubbing, setVolumeScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [videoDims, setVideoDims] = useState({ w: 16, h: 9 });

  const canAttemptLocalWarm = useMemo(
    () => source.site === "coomer" && Boolean(source.sourceFingerprint) && Boolean(source.path),
    [source.path, source.site, source.sourceFingerprint]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      const visible = isDocumentVisible();
      setIsPageVisible(visible);

      if (!visible) {
        warmAbortControllerRef.current?.abort();
        warmAbortControllerRef.current = null;
        warmPromiseRef.current = null;
        setIsWarmingLocal(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    warmAbortControllerRef.current?.abort();
    warmAbortControllerRef.current = null;
    warmPromiseRef.current = null;

    const nextSourceUrl = source.localStreamUrl ?? source.upstreamUrl;
    activeSourceUrlRef.current = nextSourceUrl;
    setActiveSourceUrl(nextSourceUrl);
    setLocalStreamUrl(source.localStreamUrl);
    setLocalSourceAvailable(source.localSourceAvailable);
    setSourceCacheStatus(source.sourceCacheStatus);
    setIsWarmingLocal(false);
    setPlayerError(null);
  }, [source.localSourceAvailable, source.localStreamUrl, source.sourceCacheStatus, source.upstreamUrl, source.sourceFingerprint]);

  const turboInputUrl = turboEnabled && activeSourceUrl === source.upstreamUrl ? source.upstreamUrl : undefined;
  const {
    sourceUrl: turboSourceUrl,
    progress,
    isLoading: isTurboLoading,
    isFallback: isTurboFallback,
    playTurbo,
  } = useTurboVideo(turboInputUrl, videoRef);

  const renderedSourceUrl = turboInputUrl ? turboSourceUrl : activeSourceUrl;

  const resetHide = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const switchPlaybackSource = useCallback((nextUrl: string, resumePlayback: boolean) => {
    const videoElement = videoRef.current;
    pendingResumeTimeRef.current = videoElement && Number.isFinite(videoElement.currentTime)
      ? videoElement.currentTime
      : null;
    pendingPlayAfterSwitchRef.current = resumePlayback;
    activeSourceUrlRef.current = nextUrl;
    setPlayerError(null);
    setBuffering(true);
    setActiveSourceUrl(nextUrl);
  }, []);

  const applyWarmState = useCallback((payload: WarmResponse) => {
    setLocalSourceAvailable(payload.localSourceAvailable);
    setSourceCacheStatus(payload.sourceCacheStatus);
    setLocalStreamUrl(payload.localStreamUrl);
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || !canAttemptLocalWarm) {
      return;
    }

    const channel = new BroadcastChannel("kimono-media-source-warm");
    warmChannelRef.current = channel;
    channel.onmessage = (event) => {
      const message = event.data as { type?: string; sourceFingerprint?: string; payload?: WarmResponse } | null;
      if (!message || message.sourceFingerprint !== source.sourceFingerprint) {
        return;
      }

      if (message.type === "started") {
        setSourceCacheStatus((currentStatus) => currentStatus ?? "source-downloading");
        return;
      }

      if (message.type === "ready" && message.payload) {
        applyWarmState(message.payload);
        if (message.payload.localSourceAvailable && message.payload.localStreamUrl) {
          const videoElement = videoRef.current;
          if ((!videoElement || videoElement.paused) && activeSourceUrlRef.current !== message.payload.localStreamUrl) {
            switchPlaybackSource(message.payload.localStreamUrl, false);
          }
        }
      }
    };

    return () => {
      if (warmChannelRef.current === channel) {
        warmChannelRef.current = null;
      }
      channel.close();
    };
  }, [applyWarmState, canAttemptLocalWarm, source.sourceFingerprint, switchPlaybackSource]);

  const requestWarmState = useCallback(async (signal?: AbortSignal): Promise<WarmResponse | null> => {
    if (!canAttemptLocalWarm || !isPageVisible) {
      return null;
    }

    const response = await fetch("/api/media/warm", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal,
      body: JSON.stringify({
        site: source.site,
        service: source.service,
        creatorId: source.creatorId,
        postId: source.postId,
        path: source.path,
        sourceFingerprint: source.sourceFingerprint,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as WarmResponse;
    applyWarmState(payload);
    return payload;
  }, [applyWarmState, canAttemptLocalWarm, isPageVisible, source.creatorId, source.path, source.postId, source.service, source.site, source.sourceFingerprint]);

  const warmLocalSourceInBackground = useCallback(async (): Promise<string | null> => {
    if (!canAttemptLocalWarm || !isPageVisible) {
      return null;
    }

    if (localSourceAvailable && localStreamUrl) {
      return localStreamUrl;
    }

    if (warmPromiseRef.current) {
      return warmPromiseRef.current;
    }

    const controller = new AbortController();
    warmAbortControllerRef.current?.abort();
    warmAbortControllerRef.current = controller;
    setIsWarmingLocal(true);

    const runWarmRequest = async () => {
      warmChannelRef.current?.postMessage({
        type: "started",
        sourceFingerprint: source.sourceFingerprint,
      });

      const payload = await requestWarmState(controller.signal);
      if (payload?.localSourceAvailable && payload.localStreamUrl) {
        warmChannelRef.current?.postMessage({
          type: "ready",
          sourceFingerprint: source.sourceFingerprint,
          payload,
        });

        const videoElement = videoRef.current;
        if ((!videoElement || videoElement.paused) && activeSourceUrlRef.current !== payload.localStreamUrl) {
          switchPlaybackSource(payload.localStreamUrl, false);
        }
        return payload.localStreamUrl;
      }

      return null;
    };

    const locksApi = typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          locks?: {
            request?: <T>(
              name: string,
              options: { ifAvailable: boolean },
              callback: (lock: Lock | null) => Promise<T>
            ) => Promise<T>;
          };
        }).locks
      : undefined;

    const warmPromise = (locksApi?.request
      ? locksApi.request<string | null>(`kimono-media-warm:${source.sourceFingerprint}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            setSourceCacheStatus((currentStatus) => currentStatus ?? "source-downloading");
            return null;
          }

          return await runWarmRequest();
        })
      : runWarmRequest())
      .catch((error) => {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          setSourceCacheStatus((currentStatus) => currentStatus ?? "warm-failed");
        }
        return null;
      })
      .finally(() => {
        if (warmAbortControllerRef.current === controller) {
          warmAbortControllerRef.current = null;
        }
        warmPromiseRef.current = null;
        setIsWarmingLocal(false);
      });

    warmPromiseRef.current = warmPromise;
    return warmPromise;
  }, [canAttemptLocalWarm, isPageVisible, localSourceAvailable, localStreamUrl, requestWarmState, source.sourceFingerprint, switchPlaybackSource]);
  const startWarmLocalSource = useCallback(() => {
    void warmLocalSourceInBackground();
  }, [warmLocalSourceInBackground]);

  useEffect(() => {
    return () => {
      warmAbortControllerRef.current?.abort();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const syncDuration = () => setDuration(getEffectiveDuration(videoElement));
    const syncMetadata = () => {
      syncDuration();
      setPlayerError(null);
      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        setVideoDims({ w: videoElement.videoWidth, h: videoElement.videoHeight });
      }
      if (pendingResumeTimeRef.current != null) {
        videoElement.currentTime = Math.min(pendingResumeTimeRef.current, getEffectiveDuration(videoElement));
        pendingResumeTimeRef.current = null;
      }
      if (pendingPlayAfterSwitchRef.current) {
        pendingPlayAfterSwitchRef.current = false;
        const playPromise = videoElement.play();
        playPromise?.catch(() => {
          setPlayerError("Playback could not resume automatically.");
        });
      }
    };

    const handlePlay = () => {
      setPlaying(true);
      setPlayerError(null);
    };
    const handlePause = () => setPlaying(false);
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => {
      setBuffering(false);
      setPlayerError(null);
    };
    const handleTimeUpdate = () => setCurrentTime(videoElement.currentTime);
    const handleVolumeChange = () => {
      setVolume(videoElement.volume);
      setMuted(videoElement.muted);
    };
    const handleError = () => {
      setBuffering(false);
      const currentUrl = activeSourceUrlRef.current;
      const isUsingLocalStream = Boolean(localStreamUrl && currentUrl === localStreamUrl);

      if (isUsingLocalStream && currentUrl !== source.upstreamUrl) {
        setPlayerError("Local stream failed. Retrying upstream playback.");
        switchPlaybackSource(source.upstreamUrl, true);
        return;
      }

      setPlayerError(describeVideoError(videoElement.error?.code));
    };

    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("waiting", handleWaiting);
    videoElement.addEventListener("playing", handlePlaying);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("durationchange", syncDuration);
    videoElement.addEventListener("loadedmetadata", syncMetadata);
    videoElement.addEventListener("volumechange", handleVolumeChange);
    videoElement.addEventListener("error", handleError);

    syncMetadata();
    handleVolumeChange();

    return () => {
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("waiting", handleWaiting);
      videoElement.removeEventListener("playing", handlePlaying);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("durationchange", syncDuration);
      videoElement.removeEventListener("loadedmetadata", syncMetadata);
      videoElement.removeEventListener("volumechange", handleVolumeChange);
      videoElement.removeEventListener("error", handleError);
    };
  }, [localStreamUrl, renderedSourceUrl, source.upstreamUrl, switchPlaybackSource]);

  const togglePlay = useCallback(async () => {
    if (isTogglingRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    isTogglingRef.current = true;
    try {
      if (videoElement.paused) {
        setPlayerError(null);

        if (localSourceAvailable && localStreamUrl && activeSourceUrlRef.current !== localStreamUrl) {
          switchPlaybackSource(localStreamUrl, true);
          resetHide();
          return;
        }

        if (!localSourceAvailable) {
          void startWarmLocalSource();
        }

        if (activeSourceUrlRef.current === source.upstreamUrl && !isTurboLoading && !isTurboFallback && turboSourceUrl === source.upstreamUrl) {
          void playTurbo();
        }

        try {
          await videoElement.play();
        } catch {
          setPlayerError("Playback could not start.");
        }
      } else {
        videoElement.pause();
      }

      resetHide();
    } finally {
      isTogglingRef.current = false;
    }
  }, [isTurboFallback, isTurboLoading, localSourceAvailable, localStreamUrl, playTurbo, resetHide, source.upstreamUrl, startWarmLocalSource, switchPlaybackSource, turboSourceUrl]);
  const seekToPointer = useCallback((clientX: number) => {
    const videoElement = videoRef.current;
    const barElement = barRef.current;
    if (!videoElement || !barElement) {
      return;
    }

    const rect = barElement.getBoundingClientRect();
    const ratio = getPointerRatio(clientX, rect.left, rect.width);
    videoElement.currentTime = ratio * getEffectiveDuration(videoElement);
  }, []);

  const setVolumeFromPointer = useCallback((clientX: number) => {
    const videoElement = videoRef.current;
    const barElement = volumeBarRef.current;
    if (!videoElement || !barElement) {
      return;
    }

    const rect = barElement.getBoundingClientRect();
    const ratio = getPointerRatio(clientX, rect.left, rect.width);
    videoElement.volume = ratio;
    videoElement.muted = ratio === 0;
    setVolume(ratio);
    setMuted(ratio === 0);
  }, []);

  const handleGlobalPointerMove = useEffectEvent((event: globalThis.MouseEvent) => {
    if (scrubbing) {
      seekToPointer(event.clientX);
    }

    if (volumeScrubbing) {
      setVolumeFromPointer(event.clientX);
    }
  });

  const handleGlobalPointerUp = useEffectEvent(() => {
    if (scrubbing) {
      setScrubbing(false);
      if (wasPlayingRef.current) {
        const videoElement = videoRef.current;
        const playPromise = videoElement?.play();
        playPromise?.catch(() => {});
      }
    }

    if (volumeScrubbing) {
      setVolumeScrubbing(false);
    }
  });

  useEffect(() => {
    if (!scrubbing && !volumeScrubbing) {
      return;
    }

    const onMove = (event: globalThis.MouseEvent) => handleGlobalPointerMove(event);
    const onUp = () => handleGlobalPointerUp();

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scrubbing, volumeScrubbing]);

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const videoElement = videoRef.current;
    const wrapperElement = wrapperRef.current;
    if (!videoElement || !wrapperElement) {
      return;
    }

    if (
      !vpFullscreen &&
      !wrapperElement.contains(document.activeElement) &&
      document.activeElement !== wrapperElement
    ) {
      return;
    }

    const activeTag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (["input", "textarea", "select"].includes(activeTag)) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case " ":
        event.preventDefault();
        void togglePlay();
        break;
      case "m":
        event.preventDefault();
        videoElement.muted = !videoElement.muted;
        setMuted(videoElement.muted);
        break;
      case "f":
        event.preventDefault();
        setFit((currentFit) => (currentFit === "contain" ? "cover" : "contain"));
        break;
      case "r":
        event.preventDefault();
        setRotation((currentRotation) => (currentRotation + 90) % 360);
        break;
      case "escape":
        event.preventDefault();
        setVpFullscreen(false);
        break;
      case "arrowleft":
        event.preventDefault();
        videoElement.currentTime = Math.max(
          0,
          videoElement.currentTime - (event.shiftKey ? 10 : 5)
        );
        break;
      case "arrowright":
        event.preventDefault();
        videoElement.currentTime = Math.min(
          getEffectiveDuration(videoElement),
          videoElement.currentTime + (event.shiftKey ? 10 : 5)
        );
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleWindowKeyDown(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSeekHover = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const barElement = barRef.current;
    if (!barElement) {
      return;
    }

    const rect = barElement.getBoundingClientRect();
    const ratio = getPointerRatio(event.clientX, rect.left, rect.width);
    setHoverTime(ratio * getEffectiveDuration(videoRef.current));
    setHoverX(event.clientX - rect.left);
  }, []);

  const handleDownload = useCallback(() => {
    if (canAttemptLocalWarm && !localSourceAvailable) {
      void startWarmLocalSource();
    }

    const params = new URLSearchParams({
      site: source.site,
      service: source.service,
      creatorId: source.creatorId,
      postId: source.postId,
      path: source.path,
      sourceFingerprint: source.sourceFingerprint,
      filename: filename || source.path.split("/").pop() || "video",
    });

    const anchor = document.createElement("a");
    anchor.href = `/api/media/download?${params.toString()}`;
    anchor.download = filename || source.path.split("/").pop() || "video";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => anchor.remove(), 0);
  }, [canAttemptLocalWarm, filename, localSourceAvailable, source.creatorId, source.path, source.postId, source.service, source.site, source.sourceFingerprint, startWarmLocalSource]);
  const handleVideoAreaClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;

        const rect = event.currentTarget.getBoundingClientRect();
        const action = getVideoAreaAction(event.clientX, rect.left, rect.width);
        const videoElement = videoRef.current;
        if (!videoElement) {
          return;
        }

        if (action === "seek-backward") {
          videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
          return;
        }

        if (action === "seek-forward") {
          videoElement.currentTime = Math.min(
            getEffectiveDuration(videoElement),
            videoElement.currentTime + 10
          );
          return;
        }

        setFit((currentFit) => (currentFit === "contain" ? "cover" : "contain"));
        return;
      }

      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        void togglePlay();
      }, 220);
    },
    [togglePlay]
  );

  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon =
    effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  const fitLabel =
    fit === "contain" ? "Zoom to fill" : "Fit to screen";
  const fullscreenLabel =
    vpFullscreen ? "Exit fullscreen" : "Fullscreen";

  return (
    <>
      {vpFullscreen && (
        <div
          className={`relative flex items-center justify-center overflow-hidden rounded-xl border border-[#1e1e2e] bg-black/30 ${className}`}
          style={{
            aspectRatio: `${videoDims.w} / ${videoDims.h}`,
            maxHeight: "85vh",
            width: "100%",
            margin: "0 auto",
          }}
        >
          <span className="select-none text-sm text-[#6b7280]">
            {"Fullscreen playback..."}
          </span>
        </div>
      )}

      <div
        ref={wrapperRef}
        tabIndex={0}
        className={
          vpFullscreen
            ? "fixed inset-0 z-[9999] flex items-center justify-center bg-black outline-none focus:outline-none"
            : `relative overflow-hidden rounded-xl bg-black outline-none focus:outline-none ${className}`
        }
        style={
          vpFullscreen
            ? { cursor: showControls ? "default" : "none" }
            : {
                aspectRatio: `${videoDims.w} / ${videoDims.h}`,
                maxHeight: "85vh",
                width: "100%",
                margin: "0 auto",
                cursor: showControls ? "default" : "none",
              }
        }
        onMouseEnter={resetHide}
        onMouseMove={resetHide}
      >
        <div className="relative flex h-full w-full items-center justify-center bg-black">
          <video
            ref={videoRef}
            src={renderedSourceUrl}
            poster={poster}
            playsInline
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: fit,
              transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
              transformOrigin: "center center",
              display: "block",
            }}
          />

          {(buffering || isTurboLoading || isWarmingLocal) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-white opacity-70" />
            </div>
          )}

          {playerError && (
            <div className="absolute inset-x-4 top-4 z-20 rounded-xl border border-red-500/30 bg-black/70 px-3 py-2 text-sm text-red-100 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="flex-1">{playerError}</span>
                <button
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/10"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPlayerError(null);
                    void togglePlay();
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          <div className="absolute inset-0 z-10" onClick={handleVideoAreaClick} />

          <div
            className="absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300"
            style={{
              opacity: showControls || !playing ? 1 : 0,
              pointerEvents: showControls || !playing ? "auto" : "none",
            }}
            onMouseEnter={() => {
              if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
              }
              setShowControls(true);
            }}
          >
            <div
              className="absolute inset-0 rounded-b-xl"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
                pointerEvents: "none",
              }}
            />

            <div className="relative space-y-2 px-4 pb-4 pt-8">
              <div
                ref={barRef}
                className="group/bar relative h-1.5 cursor-pointer rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
                onClick={(event) => seekToPointer(event.clientX)}
                onMouseDown={(event) => {
                  const videoElement = videoRef.current;
                  wasPlayingRef.current = Boolean(videoElement && !videoElement.paused);
                  videoElement?.pause();
                  setScrubbing(true);
                  seekToPointer(event.clientX);
                }}
                onMouseLeave={() => setHoverTime(null)}
                onMouseMove={handleSeekHover}
              >
                <div
                  className="pointer-events-none absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: "rgba(255,255,255,0.4)",
                  }}
                />
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: `${progressRatio * 100}%`,
                    backgroundColor: "#7c3aed",
                    transition: "width 0.05s linear",
                  }}
                />
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover/bar:opacity-100"
                  style={{ left: `${progressRatio * 100}%` }}
                />
                {hoverTime !== null && (
                  <div
                    className="pointer-events-none absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 font-mono text-xs text-white"
                    style={{ left: hoverX }}
                  >
                    {formatPlayerTime(hoverTime)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  aria-label={playing ? "Pause" : "Play"}
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  onClick={(event) => {
                    event.stopPropagation();
                    void togglePlay();
                  }}
                  title={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>

                <span className="ml-1 mr-2 min-w-[90px] select-none text-xs tabular-nums text-gray-300">
                  {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
                </span>

                {sourceCacheStatus && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/60">
                    {sourceCacheStatus}
                  </span>
                )}

                <div className="flex-1" />

                <div className="group/vol flex items-center gap-1">
                  <button
                    aria-label={effectiveVolume === 0 ? "Unmute" : "Mute"}
                    className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                    onClick={(event) => {
                      event.stopPropagation();
                      const videoElement = videoRef.current;
                      if (!videoElement) {
                        return;
                      }
                      videoElement.muted = !videoElement.muted;
                      setMuted(videoElement.muted);
                    }}
                    title={effectiveVolume === 0 ? "Unmute" : "Mute"}
                  >
                    <VolumeIcon className="h-4 w-4" />
                  </button>
                  <div className="w-0 overflow-hidden transition-all duration-200 group-hover/vol:w-16">
                    <div
                      ref={volumeBarRef}
                      className="relative h-1.5 w-16 cursor-pointer rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                      onClick={(event) => setVolumeFromPointer(event.clientX)}
                      onMouseDown={(event) => {
                        setVolumeScrubbing(true);
                        setVolumeFromPointer(event.clientX);
                      }}
                    >
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width: `${effectiveVolume * 100}%`,
                          backgroundColor: "#7c3aed",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  aria-label="Download"
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title="Download"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDownload();
                  }}
                >
                  <Download className="h-4 w-4" />
                </button>

                <button
                  aria-label={fitLabel}
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title={fitLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFit((currentFit) => (currentFit === "contain" ? "cover" : "contain"));
                  }}
                >
                  {fit === "contain" ? (
                    <Maximize2 className="h-4 w-4" />
                  ) : (
                    <Minimize2 className="h-4 w-4" />
                  )}
                </button>

                <button
                  aria-label="Rotate"
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title="Rotate"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRotation((currentRotation) => (currentRotation + 90) % 360);
                  }}
                >
                  <RotateCwSquare className="h-4 w-4" />
                </button>

                <button
                  aria-label={fullscreenLabel}
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title={fullscreenLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    setVpFullscreen((current) => !current);
                  }}
                >
                  {vpFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


