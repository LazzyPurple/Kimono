import axios, { AxiosInstance, AxiosError } from "axios";
import type { Creator, Post } from "./kemono";

import { getCachedCreators, setCachedCreators } from "@/lib/api/creators-cache";
const client: AxiosInstance = axios.create({
  baseURL: "https://coomer.st/api",
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
    console.log(`[COOMER] Retry ${config.__retryCount} after ${delay}ms (status ${status})`);
    await new Promise(r => setTimeout(r, delay));
    return client(config);
  }
  throw error;
});

/**
 * Récupère les posts d'un créateur
 * NOTE: Coomer a changé son API en août 2025 :
 *   ancien : /v1/{service}/user/{id}?o=
 *   nouveau: /v1/{service}/user/{id}/posts?o=
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
 * Recherche des créateurs par nom.
 * Coomer n'a PAS d'endpoint /v1/creators.txt (contrairement à Kemono).
 * On essaie plusieurs endpoints en fallback.
 * Si aucun ne fonctionne, on retourne un tableau vide silencieusement
 * (la recherche fonctionnera toujours via Kemono dans unified.ts).
 */
export async function searchCreators(query: string): Promise<Creator[]> {
  let allCreators = await getCachedCreators("coomer");

  if (!allCreators || allCreators.length === 0) {
    const endpoints = ["/v1/creators.txt", "/v1/creators"];

    for (const endpoint of endpoints) {
      try {
        console.log("[SEARCH/coomer] Trying endpoint:", endpoint);
        const { data } = await client.get(endpoint);
        console.log("[SEARCH/coomer] response type:", typeof data,
          "| isArray:", Array.isArray(data), "| length:", data?.length);

        const creators: Creator[] = typeof data === "string" ? JSON.parse(data) : data;

        if (Array.isArray(creators) && creators.length > 0) {
          allCreators = creators;
          await setCachedCreators("coomer", allCreators);
          console.log("[SEARCH/coomer] Fetched creators count:", creators.length, "from", endpoint);
          break;
        }
      } catch (err: any) {
        console.log(`[SEARCH/coomer] ${endpoint} failed:`, err?.response?.status || err?.message);
        continue;
      }
    }

    if (!allCreators || allCreators.length === 0) {
      console.log("[SEARCH/coomer] No creators endpoint available — coomer search disabled");
      return [];
    }
  }

  if (!query.trim()) return allCreators;
  const lower = query.toLowerCase();
  const result = allCreators.filter((c: Creator) => c.name.toLowerCase().includes(lower)).slice(0, 50);
  console.log("[SEARCH/coomer] Results for query", query, ":", result.length, "matches");
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