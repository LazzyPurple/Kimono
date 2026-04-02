"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCwSquare,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatPlayerTime, getEffectiveDuration, getPointerRatio } from "@/lib/video-player-utils";

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

function describeVideoError(code?: number): string {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Playback was interrupted.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Network error while loading the video.";
    case MediaError.MEDIA_ERR_DECODE:
      return "This video could not be decoded.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This video source is not supported.";
    default:
      return "Video playback failed.";
  }
}

export default function VideoPlayer({ source, poster, filename, className = "", turboEnabled: _turboEnabled = true }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const activationRequestedRef = useRef(false);

  const [activated, setActivated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const sourceUrl = useMemo(() => source.localStreamUrl ?? source.upstreamUrl, [source.localStreamUrl, source.upstreamUrl]);

  useEffect(() => {
    setActivated(false);
    activationRequestedRef.current = false;
    setPlaying(false);
    setBuffering(false);
    setPlayerError(null);
    setCurrentTime(0);
    setDuration(0);
  }, [sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(getEffectiveDuration(video));
      if (activationRequestedRef.current) {
        void video.play().catch(() => {
          setPlayerError("The browser blocked autoplay. Press play again.");
        });
        activationRequestedRef.current = false;
      }
    };
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(getEffectiveDuration(video));
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => {
      setPlaying(true);
      setBuffering(false);
      setPlayerError(null);
    };
    const handlePause = () => setPlaying(false);
    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const handleError = () => setPlayerError(describeVideoError(video.error?.code));
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current);

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("volumechange", handleVolumeChange);
    video.addEventListener("error", handleError);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("volumechange", handleVolumeChange);
      video.removeEventListener("error", handleError);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [sourceUrl]);

  const ensureActivated = () => {
    if (!activated) {
      setActivated(true);
    }
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setPlayerError(null);
    ensureActivated();

    if (!activated) {
      activationRequestedRef.current = true;
      return;
    }

    if (video.paused) {
      await video.play().catch(() => setPlayerError("Unable to start playback."));
      return;
    }

    video.pause();
  };

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const rect = bar.getBoundingClientRect();
    const ratio = getPointerRatio(event.clientX, rect.left, rect.width);
    video.currentTime = ratio * duration;
    setCurrentTime(video.currentTime);
  };

  const handleVolume = (event: MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = volumeRef.current;
    if (!video || !bar) {
      return;
    }

    const rect = bar.getBoundingClientRect();
    const nextVolume = getPointerRatio(event.clientX, rect.left, rect.width);
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(video.muted);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    if (document.fullscreenElement === wrapper) {
      await document.exitFullscreen().catch(() => {});
      return;
    }

    await wrapper.requestFullscreen?.().catch(() => {});
  };

  const handleDownload = () => {
    if (!sourceUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = sourceUrl;
    anchor.download = filename ?? source.path.split("/").pop() ?? "video";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const objectClass = fit === "cover" ? "object-cover" : "object-contain";

  return (
    <div ref={wrapperRef} className={`neo-panel overflow-hidden bg-[#111111] ${className}`}>
      <div className="relative aspect-video bg-black" onMouseEnter={ensureActivated}>
        <video
          ref={videoRef}
          src={activated ? sourceUrl : undefined}
          poster={poster}
          preload="none"
          controls={false}
          playsInline
          className={`h-full w-full ${objectClass}`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 border-t-2 border-white bg-[#111111]/95 p-4">
          <div ref={progressRef} className="h-4 cursor-pointer border-2 border-white bg-[#0a0a0a]" onClick={handleSeek}>
            <div className="h-full bg-[#7C3AED]" style={{ width: `${progressRatio * 100}%` }} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" className="neo-button neo-button-primary" onClick={() => void togglePlay()}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="neo-button" onClick={toggleMute}>
                {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : volume > 0.5 ? <Volume2 className="h-4 w-4" /> : <Volume1 className="h-4 w-4" />}
              </button>
              <div ref={volumeRef} className="h-4 w-28 cursor-pointer border-2 border-white bg-[#0a0a0a]" onClick={handleVolume}>
                <div className="h-full bg-[#EC4899]" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
              </div>
            </div>

            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#888888]">
              {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" className="neo-button" onClick={() => setFit((current) => (current === "contain" ? "cover" : "contain"))}>{fit}</button>
              <button type="button" className="neo-button" onClick={() => setRotation((current) => (current + 90) % 360)}><RotateCwSquare className="h-4 w-4" /></button>
              <button type="button" className="neo-button" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
              <button type="button" className="neo-button" onClick={handleDownload}><Download className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.2em] text-[#888888]">
            <span>{source.localSourceAvailable ? "local source" : "upstream source"}</span>
            <span>{buffering ? "buffering" : playerError ? "error" : "ready"}</span>
            {source.sourceCacheStatus ? <span>{source.sourceCacheStatus}</span> : null}
          </div>

          {playerError ? <p className="text-sm font-medium text-[#EF4444]">{playerError}</p> : null}
        </div>
      </div>
    </div>
  );
}