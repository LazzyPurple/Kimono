import axios, { AxiosInstance } from "axios";

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
