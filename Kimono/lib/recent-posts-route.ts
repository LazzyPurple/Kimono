import type { UnifiedPost } from "./api/helpers.ts";

interface RecentPostsDependencies {
  offset: number;
  fetchPosts?: (offset: number) => Promise<UnifiedPost[]>;
}

async function defaultFetchPosts(offset: number): Promise<UnifiedPost[]> {
  const module = await import("./api/unified.ts");
  return module.fetchRecentPosts(offset);
}

export async function getRecentPostsPayload(
  dependencies: RecentPostsDependencies
): Promise<UnifiedPost[]> {
  const fetchPosts = dependencies.fetchPosts ?? defaultFetchPosts;
  return fetchPosts(dependencies.offset);
}
