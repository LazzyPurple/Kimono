import type { PopularPeriod } from "../db/index.ts";
import type { Creator, Post } from "./kemono.ts";
import { fetchUpstreamJson, fetchUpstreamText } from "./upstream-fetch.ts";

export const SITE_BASE_URLS = {
  kemono: "https://kemono.cr",
  coomer: "https://coomer.st",
} as const;

export type Site = keyof typeof SITE_BASE_URLS;

export interface PopularResponse {
  info: any | null;
  props: any | null;
  posts: Post[];
}

export async function fetchAllCreatorsFromSite(site: Site): Promise<Creator[]> {
  const baseUrl = SITE_BASE_URLS[site];
  const endpoints = ["/api/v1/creators.txt", "/api/v1/creators"];

  for (const endpoint of endpoints) {
    try {
      const raw = await fetchUpstreamText({
        site,
        url: `${baseUrl}${endpoint}`,
        timeoutMs: 60_000,
      });

      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function fetchPopularPostsFromSite(input: {
  site: Site;
  period: PopularPeriod;
  date?: string | null;
  offset?: number;
}): Promise<PopularResponse> {
  const targetUrl = new URL(`${SITE_BASE_URLS[input.site]}/api/v1/posts/popular`);
  targetUrl.searchParams.set("period", input.period);

  if (input.date && input.period !== "recent") {
    targetUrl.searchParams.set("date", input.date);
  }

  if (input.offset && input.offset > 0) {
    targetUrl.searchParams.set("o", String(input.offset));
  }

  const data = await fetchUpstreamJson<any>({
    site: input.site,
    url: targetUrl.toString(),
    timeoutMs: 60_000,
  });

  return {
    info: data?.info ?? null,
    props: data?.props ?? null,
    posts: Array.isArray(data?.posts) ? data.posts : [],
  };
}

export async function fetchPostDetailFromSite(input: {
  site: Site;
  service: string;
  creatorId: string;
  postId: string;
  cookie?: string;
}): Promise<Post> {
  const data = await fetchUpstreamJson<any>({
    site: input.site,
    url: `${SITE_BASE_URLS[input.site]}/api/v1/${input.service}/user/${input.creatorId}/post/${input.postId}`,
    cookie: input.cookie,
    timeoutMs: 60_000,
  });

  return data?.post ?? data;
}
