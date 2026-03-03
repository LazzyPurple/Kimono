"use client";

import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxProps {
  images: { src: string; alt?: string }[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

export default function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: LightboxProps) {
  const total = images.length;

  const goPrev = useCallback(() => {
    onIndexChange(index > 0 ? index - 1 : total - 1);
  }, [index, total, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange(index < total - 1 ? index + 1 : 0);
  }, [index, total, onIndexChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "ArrowRight":
          goNext();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const current = images[index];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        <X className="h-7 w-7" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm select-none">
        {index + 1} / {total}
      </div>

      {/* Prev */}
      {total > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors cursor-pointer z-10"
        >
          <ChevronLeft className="h-10 w-10" />
        </button>
      )}

      {/* Image */}
      <img
        src={current.src}
        alt={current.alt || ""}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[90vh] object-contain select-none"
      />

      {/* Next */}
      {total > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors cursor-pointer z-10"
        >
          <ChevronRight className="h-10 w-10" />
        </button>
      )}
    </div>
  );
}
