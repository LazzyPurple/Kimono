import type { UnifiedPost } from "./api/helpers.ts";
import { hydratePostsWithMediaPlatform } from "./post-preview-hydration.ts";

interface RecentPostsDependencies {
  offset: number;
  fetchPosts?: (offset: number) => Promise<UnifiedPost[]>;
  hydratePosts?: (
    posts: UnifiedPost[],
    options: {
      context: string;
    }
  ) => Promise<UnifiedPost[]>;
}

async function defaultHydratePosts(
  posts: UnifiedPost[],
  options: {
    context: string;
  }
): Promise<UnifiedPost[]> {
  return hydratePostsWithMediaPlatform(posts, options);
}

async function defaultFetchPosts(offset: number): Promise<UnifiedPost[]> {
  const module = await import("./api/unified.ts");
  return module.fetchRecentPosts(offset);
}

export async function getRecentPostsPayload(
  dependencies: RecentPostsDependencies
): Promise<UnifiedPost[]> {
  const fetchPosts = dependencies.fetchPosts ?? defaultFetchPosts;
  const hydratePosts = dependencies.hydratePosts ?? defaultHydratePosts;

  const posts = await fetchPosts(dependencies.offset);
  return hydratePosts(posts, { context: "recent-posts" });
}
