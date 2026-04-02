import { getCachedCreators, setCachedCreators } from "./creator-catalog-cache.ts";
import { fetchUpstreamJson, fetchUpstreamText } from "./upstream-fetch.ts";

export interface Creator {
  id: string;
  name: string;
  service: string;
  indexed: string;
  updated: string;
  favorited: number;
  public_id?: string | null;
  relation_id?: number | null;
  has_chats?: boolean;
  post_count?: number;
  dm_count?: number;
  share_count?: number;
  chat_count?: number;
}

export interface Post {
  id: string;
  user: string;
  service: string;
  title: string;
  content: string;
  published: string;
  added: string;
  edited: string;
  embed: Record<string, string>;
  file: {
    name: string;
    path: string;
  };
  attachments: Array<{
    name: string;
    path: string;
  }>;
}

const BASE_URL = "https://kemono.cr/api";
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
    site: "kemono",
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
      site: "kemono",
      url: buildUrl(`/v1/${service}/user/${creatorId}/profile`),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retryDelaysMs: RETRY_DELAYS_MS,
    });
  } catch {
    return null;
  }
}

export async function searchCreators(query: string): Promise<Creator[]> {
  let allCreators = await getCachedCreators("kemono");

  if (!allCreators || allCreators.length === 0) {
    const endpoints = ["/v1/creators.txt", "/v1/creators"];

    for (const endpoint of endpoints) {
      try {
        const raw = await fetchUpstreamText({
          site: "kemono",
          url: buildUrl(endpoint),
          timeoutMs: DEFAULT_TIMEOUT_MS,
          retryDelaysMs: RETRY_DELAYS_MS,
        });
        const creators: Creator[] = JSON.parse(raw);

        if (Array.isArray(creators) && creators.length > 0) {
          allCreators = creators;
          await setCachedCreators("kemono", allCreators);
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
    site: "kemono",
    url: buildUrl("/v1/recent", { o: String(offset) }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

export async function fetchFavorites(cookie: string): Promise<Creator[]> {
  return fetchUpstreamJson<Creator[]>({
    site: "kemono",
    url: buildUrl("/v1/account/favorites", { type: "artist" }),
    cookie,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

export async function fetchFavoritePosts(cookie: string): Promise<Post[]> {
  return fetchUpstreamJson<Post[]>({
    site: "kemono",
    url: buildUrl("/v1/account/favorites", { type: "post" }),
    cookie,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
  });
}

