import axios, { AxiosInstance } from "axios";
import type { Creator, Post } from "./kemono";

// Cache mémoire pour la liste des créateurs (TTL 10 minutes)
let creatorsCache: Creator[] | null = null;
let creatorsCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

const client: AxiosInstance = axios.create({
  baseURL: "https://coomer.st/api",
  headers: {
    Accept: "text/css",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://coomer.st/",
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
    `/v1/${service}/user/${creatorId}`,
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
 * Recherche des créateurs par nom (filtre client-side depuis /v1/creators.txt)
 */
export async function searchCreators(query: string): Promise<Creator[]> {
  const now = Date.now();
  console.log("[SEARCH/coomer] Cache status - has cache:", !!creatorsCache,
    "| age (s):", Math.round((now - creatorsCacheTime) / 1000));

  if (!creatorsCache || now - creatorsCacheTime > CACHE_TTL_MS) {
    try {
      const { data } = await client.get("/v1/creators.txt", {
        headers: { Accept: "application/json, text/plain, */*" },
      });
      console.log("[SEARCH/coomer] creators.txt response type:", typeof data,
        "| isArray:", Array.isArray(data), "| length:", data?.length);

      // creators.txt peut renvoyer du texte brut qu'il faut parser
      const creators: Creator[] = typeof data === "string" ? JSON.parse(data) : data;

      if (!Array.isArray(creators) || creators.length === 0) {
        throw new Error(`Unexpected creators data: ${JSON.stringify(creators).slice(0, 200)}`);
      }

      creatorsCache = creators;
      creatorsCacheTime = now;
      console.log("[SEARCH/coomer] Fetched creators count:", creators.length);
    } catch (err) {
      console.log("[SEARCH/coomer] fetch error:", err);
      // Retourner le cache périmé si disponible plutôt qu'une liste vide
      if (creatorsCache) return creatorsCache.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()));
      return [];
    }
  }

  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  const result = creatorsCache!.filter((c) => c.name.toLowerCase().includes(lower));
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
    headers: { Cookie: cookie },
    params: { type: "artist" },
  });
  return data;
}
