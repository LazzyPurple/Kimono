import axios, { AxiosError, type AxiosInstance } from "axios";
import type { Creator, Post } from "./kemono.ts";

import { getCachedCreators, setCachedCreators } from "@/lib/api/creator-catalog-cache";
import { createUpstreamBrowserHeaders } from "@/lib/api/upstream-browser-headers";
import {
  createRateLimitError,
  getGlobalUpstreamRateGuard,
  resolveUpstreamBucket,
} from "@/lib/api/upstream-rate-guard";

const client: AxiosInstance = axios.create({
  baseURL: "https://coomer.st/api",
  headers: createUpstreamBrowserHeaders("coomer"),
  timeout: 15000,
});

const RETRY_DELAYS = [1000, 3000];
const rateGuard = getGlobalUpstreamRateGuard();

client.interceptors.request.use(async (config) => {
  const bucket = resolveUpstreamBucket(config.url);
  const decision = rateGuard.canRequest("coomer", bucket);
  if (!decision.allowed) {
    throw createRateLimitError("coomer", decision.retryAfterMs, bucket);
  }
  return config;
});

client.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as AxiosError["config"] & { __retryCount?: number };
  const status = error.response?.status ?? 0;

  if (status === 429) {
    const bucket = resolveUpstreamBucket(config?.url);
    rateGuard.registerRateLimit("coomer", {
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
    ...(cookie ? { headers: createUpstreamBrowserHeaders("coomer", cookie) } : {}),
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
  let allCreators = await getCachedCreators("coomer");

  if (!allCreators || allCreators.length === 0) {
    const endpoints = ["/v1/creators.txt", "/v1/creators"];

    for (const endpoint of endpoints) {
      try {
        const { data } = await client.get(endpoint);
        const creators: Creator[] = typeof data === "string" ? JSON.parse(data) : data;

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
  const { data } = await client.get<Post[]>("/v1/recent", {
    params: { o: offset },
  });
  return data;
}

export async function fetchFavorites(cookie: string): Promise<Creator[]> {
  const { data } = await client.get<Creator[]>("/v1/account/favorites", {
    headers: createUpstreamBrowserHeaders("coomer", cookie),
    params: { type: "artist" },
  });
  return data;
}

export async function fetchFavoritePosts(cookie: string): Promise<Post[]> {
  const { data } = await client.get<Post[]>("/v1/account/favorites", {
    headers: createUpstreamBrowserHeaders("coomer", cookie),
    params: { type: "post" },
  });
  return data;
}
