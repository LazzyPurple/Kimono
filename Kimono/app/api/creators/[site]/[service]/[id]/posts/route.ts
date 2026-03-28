import { NextRequest, NextResponse } from "next/server";

import { getPostType, resolvePostMedia, type UnifiedPost } from "@/lib/api/helpers";
import { fetchCreatorPostsBySite } from "@/lib/api/unified";
import { logAppError } from "@/lib/app-logger";
import { TTL } from "@/lib/config/ttl";
import { db, withDbConnection, type KimonoSite, type PostRow } from "@/lib/db/index";
import { buildPreviewAssetPublicUrl } from "@/lib/popular-preview-assets";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";

export const dynamic = "force-dynamic";

const CREATOR_POSTS_PAGE_SIZE = 50;
const CREATOR_FILTER_SCAN_LIMIT = 10;

function parseSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

function parseMedia(value: string | null): "tout" | "images" | "videos" {
  return value === "images" || value === "videos" ? value : "tout";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date | null | undefined): string {
  return value?.toISOString() ?? "";
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function stripPreviewAssetPublicUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/^\/api\/media\/preview\//, "");
}

function mapPostRowToUnifiedPost(record: PostRow): UnifiedPost {
  const raw = parseJson<UnifiedPost>(record.rawDetailPayload ?? record.rawPreviewPayload);
  const fallbackAttachments = parseJson<Array<{ name: string; path: string }>>(record.attachmentsJson) ?? [];
  const fallbackEmbed = parseJson<Record<string, string>>(record.embedJson) ?? {};

  const basePost: UnifiedPost = raw
    ? {
        ...raw,
        site: record.site,
        service: record.service,
        user: record.creatorId,
        id: record.postId,
      }
    : {
        site: record.site,
        service: record.service,
        user: record.creatorId,
        id: record.postId,
        title: record.title ?? "",
        content: record.contentHtml ?? record.excerpt ?? "",
        published: toIso(record.publishedAt),
        added: toIso(record.addedAt),
        edited: toIso(record.editedAt),
        embed: fallbackEmbed,
        file: {
          name: record.fileName ?? "",
          path: record.filePath ?? "",
        },
        attachments: fallbackAttachments,
      };

  return {
    ...basePost,
    site: record.site,
    service: record.service,
    user: record.creatorId,
    id: record.postId,
    previewThumbnailUrl:
      basePost.previewThumbnailUrl ?? buildPreviewAssetPublicUrl(record.previewThumbnailAssetPath),
    previewClipUrl:
      basePost.previewClipUrl ?? buildPreviewAssetPublicUrl(record.previewClipAssetPath),
    previewStatus: basePost.previewStatus ?? record.previewStatus,
    previewGeneratedAt: basePost.previewGeneratedAt ?? (toIso(record.previewGeneratedAt) || null),
    previewError: basePost.previewError ?? record.previewError,
    previewSourceFingerprint: basePost.previewSourceFingerprint ?? record.previewSourceFingerprint,
    longestVideoUrl: basePost.longestVideoUrl ?? record.longestVideoUrl,
    longestVideoDurationSeconds:
      basePost.longestVideoDurationSeconds ?? record.longestVideoDurationSeconds,
    nativeThumbnailUrl: basePost.nativeThumbnailUrl ?? record.nativeThumbnailUrl,
    mediaMimeType: basePost.mediaMimeType ?? record.mediaMimeType,
    mediaWidth: basePost.mediaWidth ?? record.mediaWidth,
    mediaHeight: basePost.mediaHeight ?? record.mediaHeight,
  };
}

function createPostRowFromUnifiedPost(
  post: UnifiedPost,
  sourceKind: PostRow["sourceKind"]
): PostRow {
  const now = new Date();
  const media = resolvePostMedia(post);
  const rawFavCount = (post as unknown as Record<string, unknown>).fav_count;

  return {
    site: post.site,
    service: post.service,
    creatorId: post.user,
    postId: post.id,
    title: post.title ?? null,
    contentHtml: post.content ? String(post.content) : null,
    excerpt: post.content ? String(post.content).slice(0, 500) : null,
    publishedAt: parseDate(post.published),
    addedAt: parseDate(post.added),
    editedAt: parseDate(post.edited),
    fileName: post.file?.name ?? null,
    filePath: post.file?.path ?? null,
    attachmentsJson: JSON.stringify(post.attachments ?? []),
    embedJson: JSON.stringify(post.embed ?? {}),
    tagsJson: JSON.stringify((post as { tags?: unknown[] }).tags ?? []),
    prevPostId: (post as { prev?: string | null }).prev ?? null,
    nextPostId: (post as { next?: string | null }).next ?? null,
    favCount: typeof rawFavCount === "number" ? rawFavCount : 0,
    previewImageUrl: media.previewImageUrl ?? null,
    videoUrl: media.videoUrl ?? null,
    thumbUrl: null,
    mediaType: media.type,
    authorName: null,
    rawPreviewPayload: JSON.stringify(post),
    rawDetailPayload: null,
    detailLevel: "preview",
    sourceKind,
    isPopular: false,
    primaryPopularPeriod: null,
    primaryPopularDate: null,
    primaryPopularOffset: null,
    primaryPopularRank: null,
    popularContextsJson: null,
    longestVideoUrl: post.longestVideoUrl ?? null,
    longestVideoDurationSeconds: post.longestVideoDurationSeconds ?? null,
    previewStatus: post.previewStatus ?? null,
    nativeThumbnailUrl: post.nativeThumbnailUrl ?? null,
    previewThumbnailAssetPath: stripPreviewAssetPublicUrl(post.previewThumbnailUrl),
    previewClipAssetPath: stripPreviewAssetPublicUrl(post.previewClipUrl),
    previewGeneratedAt: parseDate(post.previewGeneratedAt ?? null),
    previewError: post.previewError ?? null,
    previewSourceFingerprint: post.previewSourceFingerprint ?? null,
    mediaMimeType: post.mediaMimeType ?? null,
    mediaWidth: post.mediaWidth ?? null,
    mediaHeight: post.mediaHeight ?? null,
    cachedAt: now,
    expiresAt: new Date(now.getTime() + TTL.post.standard),
    staleUntil: new Date(now.getTime() + TTL.post.stale),
    lastSeenAt: now,
  };
}

function arePostsFresh(posts: PostRow[]): boolean {
  if (posts.length === 0) {
    return false;
  }

  const now = Date.now();
  return posts.every((post) => post.expiresAt.getTime() > now);
}

function matchesFilteredPost(post: UnifiedPost, query: string | undefined, media: "tout" | "images" | "videos") {
  if (media === "images" && getPostType(post) !== "image") {
    return false;
  }
  if (media === "videos" && getPostType(post) !== "video") {
    return false;
  }

  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  return [post.title, post.content]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

async function readCachedCreatorPosts(site: KimonoSite, service: string, creatorId: string, offset: number, limit: number) {
  return withDbConnection((conn) => db.getCreatorPosts(conn as never, site, service, creatorId, offset, limit));
}

async function persistCreatorPosts(posts: UnifiedPost[], sourceKind: PostRow["sourceKind"]) {
  if (posts.length === 0) {
    return;
  }

  const rows = posts.map((post) => createPostRowFromUnifiedPost(post, sourceKind));
  await withDbConnection((conn) => db.upsertPosts(conn as never, rows));
}

async function fetchUnfilteredCreatorPosts(input: {
  site: KimonoSite;
  service: string;
  creatorId: string;
  offset: number;
  cookie?: string;
}) {
  const posts = await fetchCreatorPostsBySite(input.site, input.service, input.creatorId, input.offset, input.cookie);
  await persistCreatorPosts(posts, "upstream");
  return posts;
}

async function fetchFilteredCreatorPosts(input: {
  site: KimonoSite;
  service: string;
  creatorId: string;
  page: number;
  perPage: number;
  query?: string;
  media: "tout" | "images" | "videos";
  cookie?: string;
}) {
  const targetCount = input.page * input.perPage;
  const matchedPosts: UnifiedPost[] = [];
  let scannedPages = 0;
  let reachedEnd = false;

  for (let pageIndex = 0; pageIndex < CREATOR_FILTER_SCAN_LIMIT; pageIndex += 1) {
    const offset = pageIndex * CREATOR_POSTS_PAGE_SIZE;
    const upstreamPosts = await fetchCreatorPostsBySite(
      input.site,
      input.service,
      input.creatorId,
      offset,
      input.cookie,
      input.query
    );
    scannedPages += 1;

    if (upstreamPosts.length === 0) {
      reachedEnd = true;
      break;
    }

    await persistCreatorPosts(upstreamPosts, input.query || input.media !== "tout" ? "search" : "upstream");

    for (const post of upstreamPosts) {
      if (matchesFilteredPost(post, input.query, input.media)) {
        matchedPosts.push(post);
      }
    }

    if (upstreamPosts.length < CREATOR_POSTS_PAGE_SIZE) {
      reachedEnd = true;
      break;
    }

    if (matchedPosts.length >= targetCount + input.perPage) {
      break;
    }
  }

  const start = (input.page - 1) * input.perPage;
  const posts = matchedPosts.slice(start, start + input.perPage);
  const truncated = !reachedEnd && scannedPages >= CREATOR_FILTER_SCAN_LIMIT;

  return {
    posts,
    total: matchedPosts.length,
    page: input.page,
    perPage: input.perPage,
    hasNextPage: truncated || start + input.perPage < matchedPosts.length,
    scannedPages,
    truncated,
    source: "upstream" as const,
  };
}

async function buildFilteredCacheFallback(input: {
  site: KimonoSite;
  service: string;
  creatorId: string;
  page: number;
  perPage: number;
  query?: string;
  media: "tout" | "images" | "videos";
}) {
  const cached = await readCachedCreatorPosts(
    input.site,
    input.service,
    input.creatorId,
    0,
    CREATOR_FILTER_SCAN_LIMIT * CREATOR_POSTS_PAGE_SIZE
  );
  const filtered = cached
    .map(mapPostRowToUnifiedPost)
    .filter((post) => matchesFilteredPost(post, input.query, input.media));
  const start = (input.page - 1) * input.perPage;

  return {
    posts: filtered.slice(start, start + input.perPage),
    total: filtered.length,
    page: input.page,
    perPage: input.perPage,
    hasNextPage: start + input.perPage < filtered.length,
    scannedPages: 0,
    truncated: false,
    source: "stale-cache" as const,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ site: string; service: string; id: string }> }
) {
  const params = await context.params;
  const site = parseSite(params.site);
  const service = params.service?.trim() ?? "";
  const creatorId = params.id?.trim() ?? "";
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? "0") || 0);
  const query = request.nextUrl.searchParams.get("q")?.trim() || undefined;
  const media = parseMedia(request.nextUrl.searchParams.get("media"));
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.max(1, Math.min(CREATOR_POSTS_PAGE_SIZE, Number(request.nextUrl.searchParams.get("perPage") ?? String(CREATOR_POSTS_PAGE_SIZE)) || CREATOR_POSTS_PAGE_SIZE));

  if (!site || !service || !creatorId) {
    return NextResponse.json({ error: "Invalid creator params" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);

    if (query || media !== "tout") {
      try {
        const result = await fetchFilteredCreatorPosts({
          site,
          service,
          creatorId,
          page,
          perPage,
          query,
          media,
          cookie: cookie ?? undefined,
        });

        return NextResponse.json(result, {
          headers: {
            "x-kimono-source": result.source,
          },
        });
      } catch (error) {
        await logAppError("api", "filtered creator posts fetch failed", error, {
          details: { route: "/api/creators/[site]/[service]/[id]/posts", site, service, creatorId, page, perPage, query: query ?? null, media },
        });

        const fallback = await buildFilteredCacheFallback({
          site,
          service,
          creatorId,
          page,
          perPage,
          query,
          media,
        });

        return NextResponse.json(fallback, {
          headers: {
            "x-kimono-source": fallback.source,
          },
        });
      }
    }

    const cached = await readCachedCreatorPosts(site, service, creatorId, offset, CREATOR_POSTS_PAGE_SIZE);
    if (arePostsFresh(cached)) {
      return NextResponse.json({ posts: cached.map(mapPostRowToUnifiedPost), source: "db", offset, query: null, media }, {
        headers: {
          "x-kimono-source": "db",
        },
      });
    }

    try {
      const posts = await fetchUnfilteredCreatorPosts({
        site,
        service,
        creatorId,
        offset,
        cookie: cookie ?? undefined,
      });

      return NextResponse.json({ posts, source: "upstream", offset, query: null, media }, {
        headers: {
          "x-kimono-source": "upstream",
        },
      });
    } catch (error) {
      await logAppError("api", "creator posts upstream fetch failed", error, {
        details: { route: "/api/creators/[site]/[service]/[id]/posts", site, service, creatorId, offset },
      });

      if (cached.length > 0) {
        return NextResponse.json({ posts: cached.map(mapPostRowToUnifiedPost), source: "stale", offset, query: null, media }, {
          headers: {
            "x-kimono-source": "stale",
          },
        });
      }

      return NextResponse.json({ posts: [], source: "stale", offset, query: null, media }, {
        headers: {
          "x-kimono-source": "stale",
        },
      });
    }
  } catch (error) {
    await logAppError("api", "creators posts route error", error, {
      details: { route: "/api/creators/[site]/[service]/[id]/posts", site, service, creatorId, offset, query: query ?? null, media },
    });
    return NextResponse.json({ posts: [], source: "stale", offset, query: query ?? null, media }, { status: 200, headers: { "x-kimono-source": "stale" } });
  }
}



