import axios, { AxiosError, type AxiosInstance } from "axios";

import { getCachedCreators, setCachedCreators } from "@/lib/api/creators-cache";
import {
  createRateLimitError,
  getGlobalUpstreamRateGuard,
  resolveUpstreamBucket,
} from "@/lib/api/upstream-rate-guard";

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

const client: AxiosInstance = axios.create({
  baseURL: "https://kemono.cr/api",
  headers: {
    Accept: "text/css",
  },
  timeout: 15000,
});

const RETRY_DELAYS = [1000, 3000];
const rateGuard = getGlobalUpstreamRateGuard();

client.interceptors.request.use(async (config) => {
  const bucket = resolveUpstreamBucket(config.url);
  const decision = rateGuard.canRequest("kemono", bucket);
  if (!decision.allowed) {
    throw createRateLimitError("kemono", decision.retryAfterMs, bucket);
  }
  return config;
});

client.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as AxiosError["config"] & { __retryCount?: number };
  const status = error.response?.status ?? 0;

  if (status === 429) {
    const bucket = resolveUpstreamBucket(config?.url);
    rateGuard.registerRateLimit("kemono", {
      status,
      headers: error.response?.headers as Record<string, string | number | null | undefined> | undefined,
    }, bucket);
    throw error;
  }

  if (!config) {
    throw error;
  }

  config.__retryCount = config.__retryCount || 0;
  if ((status === 0 || status >= 500) && config.__retryCount < RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[config.__retryCount];
    config.__retryCount += 1;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return client(config);
  }

  throw error;
});

export async function fetchCreatorPosts(
  service: string,
  creatorId: string,
  offset: number = 0,
  cookie?: string,
  query?: string,
  tags?: string[]
): Promise<Post[]> {
  const params: Record<string, string | string[]> = { o: String(offset) };
  if (query) params.q = query;
  if (tags && tags.length) params.tag = tags;

  const { data } = await client.get<Post[]>(`/v1/${service}/user/${creatorId}/posts`, {
    params,
    ...(cookie ? { headers: { Cookie: cookie } } : {}),
  });
  return data;
}

export async function fetchCreatorProfile(
  service: string,
  creatorId: string
): Promise<Creator | null> {
  try {
    const { data } = await client.get<Creator>(`/v1/${service}/user/${creatorId}/profile`);
    return data;
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
        const { data } = await client.get(endpoint);
        const creators: Creator[] = typeof data === "string" ? JSON.parse(data) : data;

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
  const { data } = await client.get<Post[]>("/v1/recent", {
    params: { o: offset },
  });
  return data;
}

export async function fetchFavorites(cookie: string): Promise<Creator[]> {
  const { data } = await client.get<Creator[]>("/v1/account/favorites", {
    headers: { Accept: "text/css", Cookie: cookie },
    params: { type: "artist" },
  });
  return data;
}

export async function fetchFavoritePosts(cookie: string): Promise<Post[]> {
  const { data } = await client.get<Post[]>("/v1/account/favorites", {
    headers: { Accept: "text/css", Cookie: cookie },
    params: { type: "post" },
  });
  return data;
}
