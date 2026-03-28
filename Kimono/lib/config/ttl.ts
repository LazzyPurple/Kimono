export const TTL = {
  creator: {
    index: 36 * 60 * 60 * 1000,
    syncInterval: 24 * 60 * 60 * 1000,
    profile: 36 * 60 * 60 * 1000,
  },
  post: {
    standard: 1 * 60 * 60 * 1000,
    popular: 18 * 60 * 60 * 1000,
    stale: 7 * 24 * 60 * 60 * 1000,
  },
  media: {
    preview: 7 * 24 * 60 * 60 * 1000,
    popular: 72 * 60 * 60 * 1000,
    liked: 14 * 24 * 60 * 60 * 1000,
    playback: 24 * 60 * 60 * 1000,
  },
  favorites: {
    fresh: 45 * 1000,
    stale: 10 * 60 * 1000,
    cache: 7 * 24 * 60 * 60 * 1000,
  },
  discover: {
    cache: 12 * 60 * 60 * 1000,
  },
  upstream: {
    defaultTimeout: 15 * 1000,
    largePayloadTimeout: 180 * 1000,
  },
} as const;

export type TTLConfig = typeof TTL;
