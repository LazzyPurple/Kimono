import axios, { AxiosInstance, AxiosError } from "axios";

import { getCachedCreators, setCachedCreators } from "@/lib/api/creators-cache";

// Types pour l'API Kemono
export interface Creator {
  id: string;
  name: string;
  service: string;
  indexed: number;
  updated: number;
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

// Retry interceptor: 2 retries avec backoff sur 429/5xx
const RETRY_DELAYS = [1000, 3000];
client.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as any;
  if (!config) throw error;
  config.__retryCount = config.__retryCount || 0;
  const status = error.response?.status ?? 0;
  if ((status === 429 || status >= 500) && config.__retryCount < RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[config.__retryCount];
    config.__retryCount++;
    console.log(`[KEMONO] Retry ${config.__retryCount} after ${delay}ms (status ${status})`);
    await new Promise(r => setTimeout(r, delay));
    return client(config);
  }
  throw error;
});

/**
 * Récupère les posts d'un créateur
 */
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

  const { data } = await client.get<Post[]>(
    `/v1/${service}/user/${creatorId}/posts`,
    {
      params,
      ...(cookie ? { headers: { Cookie: cookie } } : {}),
    }
  );
  return data;
}

/**
 * Récupère le profil d'un créateur
 */
export async function fetchCreatorProfile(
  service: string,
  creatorId: string
): Promise<Creator | null> {
  try {
    const { data } = await client.get<Creator>(
      `/v1/${service}/user/${creatorId}/profile`
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Recherche des créateurs par nom (filtre client-side).
 * Essaie /v1/creators.txt puis /v1/creators en fallback,
 * car l'endpoint peut changer selon les versions de l'API.
 */
export async function searchCreators(query: string): Promise<Creator[]> {
  let allCreators = await getCachedCreators("kemono");

  if (!allCreators || allCreators.length === 0) {
    const endpoints = ["/v1/creators.txt", "/v1/creators"];

    for (const endpoint of endpoints) {
      try {
        console.log("[SEARCH/kemono] Trying endpoint:", endpoint);
        const { data } = await client.get(endpoint);
        console.log("[SEARCH/kemono] response type:", typeof data,
          "| isArray:", Array.isArray(data), "| length:", data?.length);

        const creators: Creator[] = typeof data === "string" ? JSON.parse(data) : data;

        if (Array.isArray(creators) && creators.length > 0) {
          allCreators = creators;
          await setCachedCreators("kemono", allCreators);
          console.log("[SEARCH/kemono] Fetched creators count:", creators.length, "from", endpoint);
          break;
        }
      } catch (err: any) {
        console.log(`[SEARCH/kemono] ${endpoint} failed:`, err?.response?.status || err?.message);
        continue;
      }
    }

    if (!allCreators || allCreators.length === 0) {
      console.log("[SEARCH/kemono] No creators endpoint available");
      return [];
    }
  }

  if (!query.trim()) return allCreators;
  const lower = query.toLowerCase();
  const result = allCreators.filter((c: Creator) => c.name.toLowerCase().includes(lower)).slice(0, 50);
  console.log("[SEARCH/kemono] Results for query", query, ":", result.length, "matches");
  return result;
}

/**
 * Récupère les posts récents
 */
export async function fetchRecentPosts(offset: number = 0): Promise<Post[]> {
  const { data } = await client.get<Post[]>("/v1/recent", {
    params: { o: offset },
  });
  return data;
}

/**
 * Récupère les favoris d'un compte avec le cookie de session
 */
export async function fetchFavorites(cookie: string): Promise<Creator[]> {
  const { data } = await client.get<Creator[]>("/v1/account/favorites", {
    headers: { Accept: "text/css", Cookie: cookie },
    params: { type: "artist" },
  });
  return data;
}
