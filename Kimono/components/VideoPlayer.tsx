"use client";

/**
 * VideoPlayer — player custom Kimono
 * Modes :
 *   - Normal      : container adaptatif au ratio naturel de la vidéo
 *   - Viewport FS : overlay fixed 100vw×100vh
 *
 * Raccourcis : Space play | M mute | F fit | R rotate | ←→ seek | Esc quitter FS
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent,
} from "react";
import { useTurboVideo } from "@/hooks/useTurboVideo";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Download,
  Maximize2,
  Minimize2,
  RotateCw,
  Expand,
  Shrink,
  Loader2,
} from "lucide-react";

/* ──────────────────────────────────────────────── */
/* Helpers                                         */
/* ──────────────────────────────────────────────── */

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function getDur(v: HTMLVideoElement | null): number {
  if (!v) return 0;
  const d = v.duration;
  if (Number.isFinite(d) && d > 0) return d;
  try {
    const r = v.seekable;
    if (r?.length > 0) {
      const end = r.end(r.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch {}
  return Math.max(0, d || 0);
}

/* ──────────────────────────────────────────────── */
/* Component                                       */
/* ──────────────────────────────────────────────── */

interface VideoPlayerProps {
  src: string;
  poster?: string;
  filename?: string;
  className?: string;
}

export default function VideoPlayer({ src, poster, filename, className = "" }: VideoPlayerProps) {
  // Initialisation de useTurboVideo
  const turbo = useTurboVideo(src);

  // Utiliser la ref vidéo fournie par le hook pour que le IntersectionObserver fonctionne
  const videoRef = turbo.videoRef;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const volBarRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const wasPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [rotation, setRotation] = useState(0);
  const [vpFullscreen, setVpFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [volScrubbing, setVolScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  // Ratio naturel de la vidéo (défaut 16:9 avant chargement)
  const [videoDims, setVideoDims] = useState({ w: 16, h: 9 });

  /* ── Auto-hide ───────────────────────────────── */
  const resetHide = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  /* ── Sync video → state ───────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(getDur(v));
    const onMeta = () => {
      setDuration(getDur(v));
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setVideoDims({ w: v.videoWidth, h: v.videoHeight });
      }
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("loadedmetadata", onMeta);
    if (v.readyState >= 1 && v.videoWidth > 0) {
      setVideoDims({ w: v.videoWidth, h: v.videoHeight });
    }
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [turbo.state.src]);

  /* ── Global scrub ────────────────────────────── */
  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) => {
      if (scrubbing && barRef.current && videoRef.current) {
        const rect = barRef.current.getBoundingClientRect();
        const r = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        videoRef.current.currentTime = r * getDur(videoRef.current);
      }
      if (volScrubbing && volBarRef.current && videoRef.current) {
        const rect = volBarRef.current.getBoundingClientRect();
        const r = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        videoRef.current.volume = r;
        videoRef.current.muted = r === 0;
        setVolume(r);
        setMuted(r === 0);
      }
    };
    const onUp = () => { 
      if (scrubbing) {
        setScrubbing(false); 
        if (wasPlayingRef.current && videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }
      setVolScrubbing(false); 
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scrubbing, volScrubbing]);

  /* ── Keyboard ────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current;
      const wrapper = wrapperRef.current;
      if (!v || !wrapper) return;
      // Actif seulement si le player est focusé ou en FS
      if (!vpFullscreen && !wrapper.contains(document.activeElement) && document.activeElement !== wrapper) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      const dur = getDur(v);
      switch (e.key.toLowerCase()) {
        case " ": 
          e.preventDefault(); 
          if (v.paused) {
            // Lancer le chargement Turbo au premier play si pas déjà fait
            if (!turbo.state.loading && !turbo.state.isFallback && turbo.state.src === src) {
              turbo.playTurbo();
            }
            const p = v.play();
            if (p) p.catch(() => {});
          } else {
            v.pause();
          }
          break;
        case "m": e.preventDefault(); v.muted = !v.muted; setMuted(v.muted); break;
        case "f": e.preventDefault(); setFit((f) => f === "contain" ? "cover" : "contain"); break;
        case "r": e.preventDefault(); setRotation((r) => (r + 90) % 360); break;
        case "escape": e.preventDefault(); setVpFullscreen(false); break;
        case "arrowleft":
          e.preventDefault();
          v.currentTime = Math.max(0, (v.currentTime || 0) - (e.shiftKey ? 10 : 5));
          break;
        case "arrowright":
          e.preventDefault();
          v.currentTime = Math.min(dur || 0, (v.currentTime || 0) + (e.shiftKey ? 10 : 5));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [vpFullscreen]);

  /* ── Actions ─────────────────────────────────── */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (!turbo.state.loading && !turbo.state.isFallback && turbo.state.src === src) {
        turbo.playTurbo();
      }
      const p = v.play();
      if (p) p.catch(() => {});
    } else {
      v.pause();
    }
    resetHide();
  }, [resetHide, turbo, src]);

  const seekClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    v.currentTime = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * getDur(v);
  }, []);

  const seekHover = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const r = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setHoverTime(r * getDur(videoRef.current));
    setHoverX(e.clientX - rect.left);
  }, []);

  const volClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !volBarRef.current) return;
    const rect = volBarRef.current.getBoundingClientRect();
    const r = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    v.volume = r; v.muted = r === 0;
    setVolume(r); setMuted(r === 0);
  }, []);

  const doDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = src;
    a.download = filename || src.split("/").pop() || "video";
    a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 0);
  }, [src, filename]);

  const handleVideoAreaClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current); clickTimer.current = null;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      const v = videoRef.current;
      if (!v) return;
      if (x < w * 0.3) v.currentTime = Math.max(0, (v.currentTime || 0) - 10);
      else if (x > w * 0.7) v.currentTime = Math.min(getDur(v), (v.currentTime || 0) + 10);
      else setFit((f) => (f === "contain" ? "cover" : "contain"));
      return;
    }
    clickTimer.current = setTimeout(() => { clickTimer.current = null; togglePlay(); }, 220);
  }, [togglePlay]);

  /* ── Derived ─────────────────────────────────── */
  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const effectiveVol = muted ? 0 : volume;
  const VolumeIcon = effectiveVol === 0 ? VolumeX : effectiveVol < 0.5 ? Volume1 : Volume2;

  /* ── Controls JSX ────────────────────────────── */
  const controls = (
    <div
      className="absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300"
      style={{ opacity: showControls || !playing ? 1 : 0, pointerEvents: showControls || !playing ? "auto" : "none" }}
      onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); setShowControls(true); }}
    >
      {/* Gradient */}
      <div
        className="absolute inset-0 rounded-b-xl"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)", pointerEvents: "none" }}
      />

      <div className="relative px-4 pb-4 pt-8 space-y-2">
        {/* Seek bar */}
        <div
          ref={barRef}
          className="relative h-1.5 rounded-full cursor-pointer group/bar"
          style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
          onClick={seekClick}
          onMouseDown={(e) => { 
            wasPlayingRef.current = !videoRef.current?.paused;
            videoRef.current?.pause();
            setScrubbing(true); 
            seekClick(e); 
          }}
          onMouseMove={seekHover}
          onMouseLeave={() => setHoverTime(null)}
        >
          {/* Buffer TurboVideo Progress */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-300 pointer-events-none"
            style={{ width: `${turbo.state.progress}%`, backgroundColor: "rgba(255,255,255,0.4)" }}
          />

          {/* Current Progress */}
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${progressRatio * 100}%`, backgroundColor: "#7c3aed", transition: "width 0.05s linear" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white opacity-0 group-hover/bar:opacity-100 transition-opacity"
            style={{ left: `${progressRatio * 100}%` }}
          />
          {hoverTime !== null && (
            <div
              className="absolute -top-8 -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap font-mono"
              style={{ left: hoverX }}
            >
              {fmtTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-1">
          <button className="text-white hover:text-[#a78bfa] transition-colors p-1.5 rounded"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          <span className="text-xs text-gray-300 tabular-nums select-none ml-1 mr-2 min-w-[90px]">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <div className="flex items-center gap-1 group/vol">
            <button className="text-white hover:text-[#a78bfa] transition-colors p-1.5 rounded"
              onClick={(e) => {
                e.stopPropagation();
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}>
              <VolumeIcon className="h-4 w-4" />
            </button>
            <div className="overflow-hidden transition-all duration-200 w-0 group-hover/vol:w-16">
              <div
                ref={volBarRef}
                className="relative h-1.5 w-16 rounded-full cursor-pointer"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                onClick={volClick}
                onMouseDown={(e) => { setVolScrubbing(true); volClick(e); }}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{ width: `${effectiveVol * 100}%`, backgroundColor: "#7c3aed" }}
                />
              </div>
            </div>
          </div>

          <button className="text-white hover:text-[#a78bfa] transition-colors p-1.5 rounded" title="Télécharger"
            onClick={(e) => { e.stopPropagation(); doDownload(); }}>
            <Download className="h-4 w-4" />
          </button>

          <button className="text-white hover:text-[#a78bfa] transition-colors p-1.5 rounded"
            title={fit === "contain" ? "Remplir" : "Contenir"}
            onClick={(e) => { e.stopPropagation(); setFit((f) => f === "contain" ? "cover" : "contain"); }}>
            {fit === "contain" ? <Expand className="h-4 w-4" /> : <Shrink className="h-4 w-4" />}
          </button>

          <button className="text-white hover:text-[#a78bfa] transition-colors p-1.5 rounded" title="Pivoter"
            onClick={(e) => { e.stopPropagation(); setRotation((r) => (r + 90) % 360); }}>
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            className="text-white hover:text-[#a78bfa] transition-colors p-1.5 rounded"
            title={vpFullscreen ? "Quitter plein écran" : "Plein écran viewport"}
            onClick={(e) => { e.stopPropagation(); setVpFullscreen((v) => !v); }}
          >
            {vpFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  const videoEl = (
    <video
      ref={videoRef}
      src={turbo.state.src}
      poster={poster}
      playsInline
      className="absolute inset-0 w-full h-full"
      style={{
        objectFit: fit,
        transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
        display: "block",
      }}
    />
  );

  /* ══════════════════════════════════════════════ */
  /* RETURN                                         */
  /* ══════════════════════════════════════════════ */
  return (
    <>
      {/* Placeholder en page quand on est en Fullscreen */}
      {vpFullscreen && (
        <div
          className={`relative rounded-xl overflow-hidden bg-black/30 border border-[#1e1e2e] flex items-center justify-center ${className}`}
          style={{
            aspectRatio: `${videoDims.w} / ${videoDims.h}`,
            maxHeight: "85vh",
            width: "100%",
            margin: "0 auto",
          }}
        >
          <span className="text-[#6b7280] text-sm select-none">Lecture en plein écran viewport…</span>
        </div>
      )}

      {/* Main Player Wrapper */}
      <div
        ref={wrapperRef}
        tabIndex={0}
        className={
          vpFullscreen
            ? "fixed inset-0 z-[9999] bg-black outline-none focus:outline-none flex items-center justify-center"
            : `relative rounded-xl overflow-hidden bg-black outline-none focus:outline-none ${className}`
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
        onMouseMove={resetHide}
        onMouseEnter={resetHide}
      >
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          {videoEl}
          {buffering && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <Loader2 className="h-10 w-10 text-white animate-spin opacity-70" />
            </div>
          )}
          <div className="absolute inset-0 z-10" onClick={handleVideoAreaClick} />
          {controls}
        </div>
      </div>
    </>
  );
}
