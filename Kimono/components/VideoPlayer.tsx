"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Download,
  Expand,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCw,
  Shrink,
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

interface VideoPlayerProps {
  src: string;
  poster?: string;
  filename?: string;
  className?: string;
}

export default function VideoPlayer({
  src,
  poster,
  filename,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);

  const {
    sourceUrl,
    progress,
    isLoading: isTurboLoading,
    isFallback: isTurboFallback,
    playTurbo,
  } = useTurboVideo(src, videoRef);

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

  const resetHide = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
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
      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        setVideoDims({ w: videoElement.videoWidth, h: videoElement.videoHeight });
      }
    };

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => setBuffering(false);
    const handleTimeUpdate = () => setCurrentTime(videoElement.currentTime);
    const handleVolumeChange = () => {
      setVolume(videoElement.volume);
      setMuted(videoElement.muted);
    };

    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("waiting", handleWaiting);
    videoElement.addEventListener("playing", handlePlaying);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("durationchange", syncDuration);
    videoElement.addEventListener("loadedmetadata", syncMetadata);
    videoElement.addEventListener("volumechange", handleVolumeChange);

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
    };
  }, [sourceUrl]);

  const togglePlay = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (videoElement.paused) {
      if (!isTurboLoading && !isTurboFallback && sourceUrl === src) {
        void playTurbo();
      }
      const playPromise = videoElement.play();
      playPromise?.catch(() => {});
    } else {
      videoElement.pause();
    }

    resetHide();
  }, [isTurboFallback, isTurboLoading, playTurbo, resetHide, sourceUrl, src]);

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
        togglePlay();
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
    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = filename || src.split("/").pop() || "video";
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => anchor.remove(), 0);
  }, [filename, src]);

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
        togglePlay();
      }, 220);
    },
    [togglePlay]
  );

  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon =
    effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

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
            Lecture en plein ecran viewport...
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
            src={sourceUrl}
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

          {(buffering || isTurboLoading) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-white opacity-70" />
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
                className="relative h-1.5 cursor-pointer rounded-full group/bar"
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
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePlay();
                  }}
                >
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>

                <span className="ml-1 mr-2 min-w-[90px] select-none text-xs tabular-nums text-gray-300">
                  {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
                </span>

                <div className="flex-1" />

                <div className="group/vol flex items-center gap-1">
                  <button
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
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title="Telecharger"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDownload();
                  }}
                >
                  <Download className="h-4 w-4" />
                </button>

                <button
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title={fit === "contain" ? "Remplir" : "Contenir"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFit((currentFit) => (currentFit === "contain" ? "cover" : "contain"));
                  }}
                >
                  {fit === "contain" ? <Expand className="h-4 w-4" /> : <Shrink className="h-4 w-4" />}
                </button>

                <button
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title="Pivoter"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRotation((currentRotation) => (currentRotation + 90) % 360);
                  }}
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                <button
                  className="rounded p-1.5 text-white transition-colors hover:text-[#a78bfa]"
                  title={vpFullscreen ? "Quitter plein ecran" : "Plein ecran viewport"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setVpFullscreen((current) => !current);
                  }}
                >
                  {vpFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}