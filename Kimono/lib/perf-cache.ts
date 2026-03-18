export type SearchFilter = "tous" | "kemono" | "coomer" | "liked";
export type SearchSort = "date" | "favorites" | "az";
export type PopularPeriod = "recent" | "day" | "week" | "month";

export interface SearchCreatorsPageParams {
  q: string;
  filter: SearchFilter;
  sort: SearchSort;
  service: string;
  page: number;
  perPage: number;
  likedCreatorKeys?: string[];
}

export interface ParsedLikedCreatorKey {
  site: "kemono" | "coomer";
  service: string;
  creatorId: string;
}

export const CREATOR_SNAPSHOT_TTL_MS = 36 * 60 * 60 * 1000;
export const POPULAR_SNAPSHOT_TTL_MS = 18 * 60 * 60 * 1000;
export const SERVER_POST_CACHE_TTL_MS = 60 * 60 * 1000;
export const BROWSER_POST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const POPULAR_FULL_DETAIL_LIMIT = 12;

export function normalizeCreatorName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCreatorCacheKey(input: {
  site: "kemono" | "coomer";
  service: string;
  creatorId: string;
}): string {
  return `${input.site}:${input.service}:${input.creatorId}`;
}

export function buildPostCacheKey(input: {
  site: "kemono" | "coomer";
  service: string;
  creatorId: string;
  postId: string;
}): string {
  return `${input.site}:${input.service}:${input.creatorId}:${input.postId}`;
}

export function buildSearchCacheKey(input: SearchCreatorsPageParams): string {
  return [
    `q=${input.q}`,
    `filter=${input.filter}`,
    `sort=${input.sort}`,
    `service=${input.service}`,
    `page=${input.page}`,
    `perPage=${input.perPage}`,
    input.likedCreatorKeys?.length ? `liked=${input.likedCreatorKeys.slice().sort().join(",")}` : null,
  ]
    .filter(Boolean)
    .join("|")
    .replace(/^/, "search:");
}

export function buildPopularCacheKey(input: {
  site: "kemono" | "coomer";
  period: PopularPeriod;
  date?: string | null;
  offset?: number;
}): string {
  return `popular:${input.site}:${input.period}:${input.date ?? "recent"}:${input.offset ?? 0}`;
}

export function buildCreatorPostsCacheKey(input: {
  site: "kemono" | "coomer";
  service: string;
  creatorId: string;
  offset: number;
  q?: string;
}): string {
  return `creator-posts:${input.site}:${input.service}:${input.creatorId}:offset=${input.offset}:q=${input.q ?? ""}`;
}

export function buildCreatorProfileCacheKey(input: {
  site: "kemono" | "coomer";
  service: string;
  creatorId: string;
}): string {
  return `creator-profile:${buildCreatorCacheKey(input)}`;
}

export function isSnapshotFresh(
  syncedAt: Date | string | null | undefined,
  ttlMs: number,
  now: Date = new Date()
): boolean {
  if (!syncedAt) {
    return false;
  }

  const syncedDate = syncedAt instanceof Date ? syncedAt : new Date(syncedAt);
  return now.getTime() - syncedDate.getTime() <= ttlMs;
}

export function isTimedCacheFresh(
  cachedAt: Date | string | null | undefined,
  ttlMs: number,
  now: Date = new Date()
): boolean {
  return isSnapshotFresh(cachedAt, ttlMs, now);
}

export function parseLikedCreatorKey(value: string): ParsedLikedCreatorKey | null {
  const [site, service, ...idParts] = value.split("-");
  if ((site !== "kemono" && site !== "coomer") || !service || idParts.length === 0) {
    return null;
  }

  return {
    site,
    service,
    creatorId: idParts.join("-"),
  };
}

export function getRelevantSearchSites(
  filter: SearchFilter,
  likedCreatorKeys: string[] = []
): Array<"kemono" | "coomer"> {
  if (filter === "kemono") {
    return ["kemono"];
  }

  if (filter === "coomer") {
    return ["coomer"];
  }

  if (filter === "liked") {
    return Array.from(
      new Set(
        likedCreatorKeys
          .map(parseLikedCreatorKey)
          .filter((item): item is ParsedLikedCreatorKey => Boolean(item))
          .map((item) => item.site)
      )
    );
  }

  return ["kemono", "coomer"];
}

export function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
