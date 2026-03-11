export type VideoAreaAction = "seek-backward" | "toggle-fit" | "seek-forward";

export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const paddedMinutes = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const paddedSeconds = String(remainingSeconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

export function getEffectiveDuration(
  video: Pick<HTMLVideoElement, "duration" | "seekable"> | null
): number {
  if (!video) {
    return 0;
  }

  const duration = video.duration;
  if (Number.isFinite(duration) && duration > 0) {
    return duration;
  }

  try {
    const seekable = video.seekable;
    if (seekable?.length > 0) {
      const end = seekable.end(seekable.length - 1);
      if (Number.isFinite(end) && end > 0) {
        return end;
      }
    }
  } catch {
    return 0;
  }

  return Math.max(0, duration || 0);
}

export function getPointerRatio(clientX: number, rectLeft: number, rectWidth: number): number {
  if (rectWidth <= 0) {
    return 0;
  }

  return Math.min(Math.max((clientX - rectLeft) / rectWidth, 0), 1);
}

export function getVideoAreaAction(
  clientX: number,
  rectLeft: number,
  rectWidth: number
): VideoAreaAction {
  const ratio = getPointerRatio(clientX, rectLeft, rectWidth);

  if (ratio < 0.3) {
    return "seek-backward";
  }

  if (ratio > 0.7) {
    return "seek-forward";
  }

  return "toggle-fit";
}