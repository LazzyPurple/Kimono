import type { Creator, Post } from "./kemono.ts";

import { getCachedCreators, setCachedCreators } from "./creator-catalog-cache.ts";
import { fetchUpstreamJson, fetchUpstreamText } from "./upstream-fetch.ts";

const BASE_URL = "https://coomer.st/api";
const RETRY_DELAYS_MS = [1_000, 3_000];
const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(pathname: string, params?: Record<string, string | string[] | undefined>): string {
  const targetUrl = new URL(`${BASE_URL}${pathname}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          targetUrl.searchParams.append(key, item);
        }
      } else {
        targetUrl.searchParams.set(key, value);
      }
    }
  }

  return targetUrl.toString();
}

export async function fetchCreatorPosts(
  service: string,
  creatorId: string,
  offset: number = 0,
  cookie?: string,
  query?: string,
  tags?: string[]
): Promise<Post[]> {
  return fetchUpstreamJson<Post[]>({
    site: "coomer",
    url: buildUrl(`/v1/${service}/user/${creatorId}/posts`, {
      o: String(offset),
      ...(query ? { q: query } : {}),
      ...(tags && tags.length ? { tag: tags } : {}),
    }),
    cookie,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

export async function fetchCreatorProfile(
  service: string,
  creatorId: string
): Promise<Creator | null> {
  try {
    return await fetchUpstreamJson<Creator>({
      site: "coomer",
      url: buildUrl(`/v1/${service}/user/${creatorId}/profile`),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retryDelaysMs: RETRY_DELAYS_MS,
    });
  } catch {
    return null;
  }
}

export async function searchCreators(query: string): Promise<Creator[]> {
  let allCreators = await getCachedCreators("coomer");

  if (!allCreators || allCreators.length === 0) {
    const endpoints = ["/v1/creators.txt", "/v1/creators"];

    for (const endpoint of endpoints) {
      try {
        const raw = await fetchUpstreamText({
          site: "coomer",
          url: buildUrl(endpoint),
          timeoutMs: DEFAULT_TIMEOUT_MS,
          retryDelaysMs: RETRY_DELAYS_MS,
        });
        const creators: Creator[] = JSON.parse(raw);

        if (Array.isArray(creators) && creators.length > 0) {
          allCreators = creators;
          await setCachedCreators("coomer", allCreators);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!allCreators || allCreators.length === 0) {
      return [];
    }
  }

  if (!query.trim()) return allCreators;
  const lower = query.toLowerCase();
  return allCreators.filter((c: Creator) => c.name.toLowerCase().includes(lower)).slice(0, 50);
}

export async function fetchRecentPosts(offset: number = 0): Promise<Post[]> {
  return fetchUpstreamJson<Post[]>({
    site: "coomer",
    url: buildUrl("/v1/recent", { o: String(offset) }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

export async function fetchFavorites(cookie: string): Promise<Creator[]> {
  return fetchUpstreamJson<Creator[]>({
    site: "coomer",
    url: buildUrl("/v1/account/favorites", { type: "artist" }),
    cookie,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

export async function fetchFavoritePosts(cookie: string): Promise<Post[]> {
  return fetchUpstreamJson<Post[]>({
    site: "coomer",
    url: buildUrl("/v1/account/favorites", { type: "post" }),
    cookie,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

