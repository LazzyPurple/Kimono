import axios from "axios";

import type { Creator, Post } from "./kemono";
import type { PopularPeriod } from "../perf-cache.ts";

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
      const response = await axios.get(`${baseUrl}${endpoint}`, {
        headers: {
          Accept: "text/css",
        },
        timeout: 15000,
      });

      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
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

  const response = await fetch(targetUrl.toString(), {
    headers: {
      Accept: "text/css",
    },
  });

  if (!response.ok) {
    throw new Error(`Popular upstream responded with ${response.status}`);
  }

  const data = await response.json();
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
  const response = await axios.get(
    `${SITE_BASE_URLS[input.site]}/api/v1/${input.service}/user/${input.creatorId}/post/${input.postId}`,
    {
      headers: {
        Accept: "text/css",
        ...(input.cookie ? { Cookie: input.cookie } : {}),
      },
      timeout: 15000,
    }
  );

  return response.data?.post ?? response.data;
}

