import axios, { AxiosInstance } from "axios";
import type { Creator, Post } from "./kemono";

const client: AxiosInstance = axios.create({
  baseURL: "https://coomer.st/api",
  headers: {
    Accept: "application/json",
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
  const { data } = await client.get<Creator[]>("/v1/creators.txt");
  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  return data.filter((c) => c.name.toLowerCase().includes(lower));
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
