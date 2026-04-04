import type { DbConnection } from "@/lib/db";
import { db, type KimonoSite, type PostRow } from "@/lib/db/index";

export const POPULAR_PAGE_SIZE = 50;

export type PopularPeriod = "recent" | "day" | "week" | "month";
export type PopularSiteFilter = KimonoSite | "both";

export interface ParsedPopularParams {
  site: PopularSiteFilter;
  period: PopularPeriod;
  page: number;
}

type PopularParamBag =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export interface PopularFeedItem {
  id: string;
  site: KimonoSite;
  service: string;
  creatorId: string;
  title: string;
  publishedAt: string | null;
  previewImageUrl: string | null;
  videoUrl: string | null;
  durationSeconds: number | null;
  mediaMimeType: string | null;
}

export interface PopularFeedResult {
  rows: PostRow[];
  hasMore: boolean;
}

function readValue(source: PopularParamBag, key: string): string | null {
  if (source instanceof URLSearchParams) {
    return source.get(key);
  }

  const value = source[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function normalizeSite(value: string | null): PopularSiteFilter {
  if (value === "kemono" || value === "coomer") {
    return value;
  }

  return "both";
}

function normalizePeriod(value: string | null): PopularPeriod {
  return value === "day" || value === "week" || value === "month" ? value : "recent";
}

function normalizePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function sortPopularRows(left: PostRow, right: PostRow): number {
  const leftRank = left.primaryPopularRank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.primaryPopularRank ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftPublished = left.publishedAt?.getTime() ?? 0;
  const rightPublished = right.publishedAt?.getTime() ?? 0;

  if (leftPublished !== rightPublished) {
    return rightPublished - leftPublished;
  }

  return `${left.site}-${left.service}-${left.creatorId}-${left.postId}`.localeCompare(
    `${right.site}-${right.service}-${right.creatorId}-${right.postId}`,
  );
}

function dedupeRows(rows: PostRow[]): PostRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.site}:${row.service}:${row.creatorId}:${row.postId}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function parsePopularParams(source: PopularParamBag): ParsedPopularParams {
  return {
    site: normalizeSite(readValue(source, "site")),
    period: normalizePeriod(readValue(source, "period")),
    page: normalizePage(readValue(source, "page")),
  };
}

export function buildPopularHref(params: ParsedPopularParams): string {
  const target = new URLSearchParams();

  if (params.site !== "both") {
    target.set("site", params.site);
  }
  if (params.period !== "recent") {
    target.set("period", params.period);
  }
  if (params.page > 1) {
    target.set("page", String(params.page));
  }

  const serialized = target.toString();
  return serialized ? `/popular?${serialized}` : "/popular";
}

export async function getPopularFeed(
  conn: DbConnection,
  params: ParsedPopularParams,
): Promise<PopularFeedResult> {
  const siteTargets: KimonoSite[] = params.site === "both" ? ["kemono", "coomer"] : [params.site];
  const windowSize = params.page * POPULAR_PAGE_SIZE + 1;
  const groups = await Promise.all(
    siteTargets.map((site) => db.getPopularPosts(conn, site, params.period, undefined, 0, windowSize)),
  );
  const merged = dedupeRows(groups.flat()).sort(sortPopularRows);
  const start = (params.page - 1) * POPULAR_PAGE_SIZE;

  return {
    rows: merged.slice(start, start + POPULAR_PAGE_SIZE),
    hasMore: merged.length > start + POPULAR_PAGE_SIZE,
  };
}

export function mapPopularRowToCard(post: PostRow): PopularFeedItem {
  return {
    id: post.postId,
    site: post.site,
    service: post.service,
    creatorId: post.creatorId,
    title: post.title?.trim() || "Untitled",
    publishedAt: post.publishedAt?.toISOString() ?? null,
    previewImageUrl:
      post.nativeThumbnailUrl ??
      post.thumbUrl ??
      post.previewImageUrl ??
      post.filePath ??
      null,
    videoUrl: post.previewClipAssetPath ?? post.longestVideoUrl ?? post.videoUrl ?? null,
    durationSeconds: post.longestVideoDurationSeconds ?? null,
    mediaMimeType: post.mediaMimeType ?? null,
  };
}
