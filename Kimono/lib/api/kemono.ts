import axios, { AxiosInstance } from "axios";

// Cache mémoire pour la liste des créateurs (TTL 10 minutes)
let creatorsCache: Creator[] | null = null;
let creatorsCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Types pour l'API Kemono
export interface Creator {
  id: string;
  name: string;
  service: string;
  indexed: number;
  updated: number;
  favorited: number;
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

/**
 * Récupère les posts d'un créateur
 */
export async function fetchCreatorPosts(
  service: string,
  creatorId: string,
  offset: number = 0
): Promise<Post[]> {
  const { data } = await client.get<Post[]>(
    `/v1/${service}/user/${creatorId}/posts`,
    { params: { o: offset } }
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
  const now = Date.now();
  console.log("[SEARCH/kemono] Cache status - has cache:", !!creatorsCache,
    "| age (s):", Math.round((now - creatorsCacheTime) / 1000));

  if (!creatorsCache || now - creatorsCacheTime > CACHE_TTL_MS) {
    const endpoints = ["/v1/creators.txt", "/v1/creators"];

    for (const endpoint of endpoints) {
      try {
        console.log("[SEARCH/kemono] Trying endpoint:", endpoint);
        const { data } = await client.get(endpoint);
        console.log("[SEARCH/kemono] response type:", typeof data,
          "| isArray:", Array.isArray(data), "| length:", data?.length);

        const creators: Creator[] = typeof data === "string" ? JSON.parse(data) : data;

        if (Array.isArray(creators) && creators.length > 0) {
          creatorsCache = creators;
          creatorsCacheTime = now;
          console.log("[SEARCH/kemono] Fetched creators count:", creators.length, "from", endpoint);
          break;
        }
      } catch (err: any) {
        console.log(`[SEARCH/kemono] ${endpoint} failed:`, err?.response?.status || err?.message);
        continue;
      }
    }

    if (!creatorsCache) {
      console.log("[SEARCH/kemono] No creators endpoint available");
      return [];
    }
  }

  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  const result = creatorsCache!.filter((c) => c.name.toLowerCase().includes(lower));
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
