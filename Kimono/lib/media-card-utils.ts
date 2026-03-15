export function pickLongestVideoDuration(
  durations: Array<number | null | undefined>
): number | null {
  const numeric = durations.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  );

  if (numeric.length === 0) {
    return null;
  }

  return Math.max(...numeric);
}

export function formatVideoDurationLabel(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
