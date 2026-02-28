import axios, { AxiosInstance } from "axios";
import type { Creator, Post } from "./kemono";

const client: AxiosInstance = axios.create({
  baseURL: "https://coomer.st/api",
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
    `/${service}/user/${creatorId}`,
    { params: { o: offset } }
  );
  return data;
}

/**
 * Recherche des créateurs par nom
 */
export async function searchCreators(query: string): Promise<Creator[]> {
  const { data } = await client.get<Creator[]>("/creators", {
    params: { q: query },
  });
  return data;
}

/**
 * Récupère les posts récents
 */
export async function fetchRecentPosts(offset: number = 0): Promise<Post[]> {
  const { data } = await client.get<Post[]>("/recent", {
    params: { o: offset },
  });
  return data;
}
