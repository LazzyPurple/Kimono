const DEFAULT_CONCURRENCY = 6;

export interface FfmpegSemaphore {
  acquire(): Promise<() => void>;
  readonly pending: number;
  readonly active: number;
}

function parseConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.FFMPEG_CONCURRENCY;
  if (!raw) {
    return DEFAULT_CONCURRENCY;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_CONCURRENCY;
}

export function createFfmpegSemaphore(maxConcurrency?: number): FfmpegSemaphore {
  const limit = maxConcurrency ?? parseConcurrency();
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  return {
    acquire(): Promise<() => void> {
      if (active < limit) {
        active += 1;
        return Promise.resolve(release);
      }

      return new Promise<() => void>((resolve) => {
        queue.push(() => resolve(release));
      });
    },

    get pending() {
      return queue.length;
    },

    get active() {
      return active;
    },
  };
}

let defaultSemaphore: FfmpegSemaphore | null = null;

export function getDefaultFfmpegSemaphore(): FfmpegSemaphore {
  defaultSemaphore ??= createFfmpegSemaphore();
  return defaultSemaphore;
}
