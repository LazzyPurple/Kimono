import {
  deduplicateCreators,
  deduplicatePosts,
  type Site,
  type UnifiedCreator,
  type UnifiedPost,
} from "./api/helpers.ts";
import { fetchCreatorPosts as fetchKemonoCreatorPosts, fetchCreatorProfile as fetchKemonoCreatorProfile, searchCreators as searchKemonoCreators } from "./api/kemono.ts";
import { fetchCreatorPosts as fetchCoomerCreatorPosts, fetchCreatorProfile as fetchCoomerCreatorProfile, searchCreators as searchCoomerCreators } from "./api/coomer.ts";
import { fetchAllCreatorsFromSite, fetchPopularPostsFromSite, fetchPostDetailFromSite } from "./api/upstream.ts";

export type { Site, UnifiedCreator, UnifiedPost };

function normalizeCreators(site: Site, creators: Array<Record<string, unknown>>): UnifiedCreator[] {
  return creators.map((creator) => ({
    ...(creator as Omit<UnifiedCreator, "site">),
    site,
  }));
}

function normalizePosts(site: Site, posts: Array<Record<string, unknown>>): UnifiedPost[] {
  return posts.map((post) => ({
    ...(post as Omit<UnifiedPost, "site">),
    site,
  }));
}

export function mergeCreators(...groups: UnifiedCreator[][]): UnifiedCreator[] {
  return deduplicateCreators(groups.flat());
}

export function mergePosts(...groups: UnifiedPost[][]): UnifiedPost[] {
  return deduplicatePosts(groups.flat());
}

export function createHybridContentService() {
  return {
    async searchCreators(query: string): Promise<UnifiedCreator[]> {
      const [kemono, coomer] = await Promise.allSettled([
        searchKemonoCreators(query),
        searchCoomerCreators(query),
      ]);

      return mergeCreators(
        kemono.status === "fulfilled" ? normalizeCreators("kemono", kemono.value as unknown as Array<Record<string, unknown>>) : [],
        coomer.status === "fulfilled" ? normalizeCreators("coomer", coomer.value as unknown as Array<Record<string, unknown>>) : [],
      );
    },

    async fetchAllCreators(site: Site): Promise<UnifiedCreator[]> {
      const creators = await fetchAllCreatorsFromSite(site);
      return normalizeCreators(site, creators as unknown as Array<Record<string, unknown>>);
    },

    async getCreatorProfile(site: Site, service: string, creatorId: string): Promise<UnifiedCreator | null> {
      const profile = site === "kemono"
        ? await fetchKemonoCreatorProfile(service, creatorId)
        : await fetchCoomerCreatorProfile(service, creatorId);

      if (!profile) {
        return null;
      }

      return {
        ...(profile as Omit<UnifiedCreator, "site">),
        site,
      };
    },

    async getCreatorPosts(site: Site, service: string, creatorId: string, offset = 0, cookie?: string, query?: string): Promise<UnifiedPost[]> {
      const posts = site === "kemono"
        ? await fetchKemonoCreatorPosts(service, creatorId, offset, cookie, query)
        : await fetchCoomerCreatorPosts(service, creatorId, offset, cookie, query);

      return normalizePosts(site, posts as unknown as Array<Record<string, unknown>>);
    },

    async getPopularPosts(site: Site, period: "recent" | "day" | "week" | "month", date?: string | null, offset?: number): Promise<UnifiedPost[]> {
      const response = await fetchPopularPostsFromSite({ site, period, date, offset });
      return normalizePosts(site, response.posts as unknown as Array<Record<string, unknown>>);
    },

    async getPostDetail(input: { site: Site; service: string; creatorId: string; postId: string; cookie?: string }): Promise<UnifiedPost> {
      const post = await fetchPostDetailFromSite(input);
      return {
        ...(post as Omit<UnifiedPost, "site">),
        site: input.site,
      };
    },
  };
}
