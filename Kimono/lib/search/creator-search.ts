import type { CreatorRow, KimonoSite, SearchCreatorsOpts } from "@/lib/db/types";

export const SEARCH_PAGE_SIZE = 50;

export const CREATOR_SEARCH_SERVICES = [
  "patreon",
  "fanbox",
  "subscribestar",
  "gumroad",
  "discord",
  "dlsite",
  "fantia",
  "boosty",
  "afdian",
  "onlyfans",
  "fansly",
  "candfans",
] as const;

export type CreatorSearchSort = "name" | "updated" | "favorited";

export interface ParsedCreatorSearchParams {
  q: string;
  page: number;
  site?: KimonoSite;
  service?: string;
  sort: CreatorSearchSort;
  order: "asc" | "desc";
}

export interface SearchCreatorCardItem {
  id: string;
  site: KimonoSite;
  service: string;
  name: string;
  favorited: number | null;
  updated: string | null;
  postCount: number;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
}

type SearchParamBag =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readValue(source: SearchParamBag, key: string): string | null {
  if (source instanceof URLSearchParams) {
    return source.get(key);
  }

  const value = source[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function normalizeSite(value: string | null): KimonoSite | undefined {
  if (!value) {
    return undefined;
  }

  return value === "kemono" || value === "coomer" ? value : undefined;
}

function normalizeService(value: string | null): string | undefined {
  if (!value || value === "all" || value === "both") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return CREATOR_SEARCH_SERVICES.includes(normalized as (typeof CREATOR_SEARCH_SERVICES)[number])
    ? normalized
    : undefined;
}

function normalizeSort(value: string | null): CreatorSearchSort {
  return value === "updated" || value === "favorited" ? value : "name";
}

function normalizePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getDefaultOrder(sort: CreatorSearchSort): "asc" | "desc" {
  return sort === "name" ? "asc" : "desc";
}

export function parseCreatorSearchParams(source: SearchParamBag): ParsedCreatorSearchParams {
  const sort = normalizeSort(readValue(source, "sort"));

  return {
    q: (readValue(source, "q") ?? "").trim(),
    page: normalizePage(readValue(source, "page")),
    site: normalizeSite(readValue(source, "site")),
    service: normalizeService(readValue(source, "service")),
    sort,
    order: getDefaultOrder(sort),
  };
}

export function toSearchCreatorsOpts(params: ParsedCreatorSearchParams): SearchCreatorsOpts {
  return {
    q: params.q || undefined,
    page: params.page,
    perPage: SEARCH_PAGE_SIZE,
    site: params.site,
    service: params.service,
    sort: params.sort,
    order: params.order,
  };
}

export function mapCreatorRowToSearchCard(creator: CreatorRow): SearchCreatorCardItem {
  return {
    id: creator.creatorId,
    site: creator.site,
    service: creator.service,
    name: creator.name,
    favorited: creator.favorited ?? null,
    updated: creator.updated != null ? new Date(creator.updated * 1000).toISOString() : null,
    postCount: creator.postCount ?? 0,
    profileImageUrl: creator.profileImageUrl,
    bannerImageUrl: creator.bannerImageUrl,
  };
}

export function buildSearchHref(params: ParsedCreatorSearchParams): string {
  const target = new URLSearchParams();

  if (params.q) {
    target.set("q", params.q);
  }
  if (params.site) {
    target.set("site", params.site);
  }
  if (params.service) {
    target.set("service", params.service);
  }
  if (params.sort !== "name") {
    target.set("sort", params.sort);
  }
  if (params.page > 1) {
    target.set("page", String(params.page));
  }

  const serialized = target.toString();
  return serialized ? `/search?${serialized}` : "/search";
}
