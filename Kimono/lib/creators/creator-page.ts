import type { Creator as UpstreamCreator, Post as UpstreamPost } from "@/lib/api/kemono";
import { fetchAllCreatorsFromSite, type Site } from "@/lib/api/upstream";
import { withDbConnection, db, type Connection, type CreatorRow, type KimonoSite, type PostRow } from "@/lib/db/index";

export const CREATOR_PAGE_SIZE = 50;

export interface ParsedCreatorPageParams {
  page: number;
}

export interface CreatorProfileCard {
  id: string;
  site: KimonoSite;
  service: string;
  name: string;
  favorited: number;
  postCount: number;
  updated: string | null;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
}

export interface CreatorPostCard {
  id: string;
  site: KimonoSite;
  service: string;
  creatorId: string;
  title: string;
  previewImageUrl: string | null;
  videoUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  mediaMimeType: string | null;
}

export interface CreatorPageData {
  creator: CreatorProfileCard;
  posts: CreatorPostCard[];
  page: number;
  hasMore: boolean;
  source: "db" | "upstream";
}

function normalizePage(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

function toUnixTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(input: string | null): Record<string, unknown> | null {
  if (!input) {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractMediaPath(post: UpstreamPost, kind: "image" | "video"): string | null {
  const candidates = [
    post.file?.path ?? null,
    ...(Array.isArray(post.attachments) ? post.attachments.map((attachment) => attachment?.path ?? null) : []),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const lowered = candidate.toLowerCase();
    if (kind === "image" && /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(lowered)) {
      return candidate;
    }
    if (kind === "video" && /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(lowered)) {
      return candidate;
    }
  }

  return null;
}

function buildExcerpt(content: string | null | undefined): string | null {
  if (!content) {
    return null;
  }

  const collapsed = content.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }

  return collapsed.slice(0, 220);
}

function mapCreatorRowToProfileCard(creator: CreatorRow): CreatorProfileCard {
  return {
    id: creator.creatorId,
    site: creator.site,
    service: creator.service,
    name: creator.name,
    favorited: creator.favorited ?? 0,
    postCount: creator.postCount ?? 0,
    updated: creator.updated != null ? new Date(creator.updated * 1000).toISOString() : null,
    profileImageUrl: creator.profileImageUrl,
    bannerImageUrl: creator.bannerImageUrl,
  };
}

function mapPostRowToCreatorCard(post: PostRow): CreatorPostCard {
  return {
    id: post.postId,
    site: post.site,
    service: post.service,
    creatorId: post.creatorId,
    title: post.title ?? "Untitled",
    previewImageUrl: post.previewImageUrl ?? post.filePath ?? null,
    videoUrl: post.videoUrl ?? null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    durationSeconds: post.longestVideoDurationSeconds ?? null,
    mediaMimeType: post.mediaMimeType ?? null,
  };
}

function mapCatalogCreatorToInsert(site: KimonoSite, creator: UpstreamCreator): CreatorRow {
  return {
    site,
    service: String(creator.service),
    creatorId: String(creator.id),
    name: String(creator.name ?? creator.id),
    normalizedName: String(creator.name ?? creator.id).trim().toLowerCase(),
    indexed: toUnixTimestamp((creator as { indexed?: unknown }).indexed),
    updated: toUnixTimestamp((creator as { updated?: unknown }).updated),
    favorited: Number((creator as { favorited?: unknown }).favorited ?? 0),
    postCount: Number((creator as { post_count?: unknown }).post_count ?? 0),
    publicId: (creator as { public_id?: string | null }).public_id ?? null,
    relationId: typeof (creator as { relation_id?: unknown }).relation_id === "number"
      ? Number((creator as { relation_id?: number }).relation_id)
      : null,
    dmCount: Number((creator as { dm_count?: unknown }).dm_count ?? 0),
    shareCount: Number((creator as { share_count?: unknown }).share_count ?? 0),
    hasChats: Boolean((creator as { has_chats?: unknown }).has_chats ?? false),
    chatCount: Number((creator as { chat_count?: unknown }).chat_count ?? 0),
    profileImageUrl: null,
    bannerImageUrl: null,
    rawIndexPayload: JSON.stringify(creator),
    rawProfilePayload: null,
    catalogSyncedAt: new Date(),
    profileCachedAt: null,
    profileExpiresAt: null,
    archivedAt: null,
  };
}

function mapUpstreamPostToRow(site: KimonoSite, post: UpstreamPost): PostRow {
  const publishedAt = post.published ? new Date(post.published) : null;
  const addedAt = post.added ? new Date(post.added) : null;
  const editedAt = post.edited ? new Date(post.edited) : null;
  const imagePath = extractMediaPath(post, "image");
  const videoPath = extractMediaPath(post, "video");

  return {
    site,
    service: String(post.service),
    creatorId: String(post.user),
    postId: String(post.id),
    title: post.title || "Untitled",
    contentHtml: post.content ?? null,
    excerpt: buildExcerpt(post.content),
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    addedAt: addedAt && !Number.isNaN(addedAt.getTime()) ? addedAt : null,
    editedAt: editedAt && !Number.isNaN(editedAt.getTime()) ? editedAt : null,
    fileName: post.file?.name ?? null,
    filePath: post.file?.path ?? null,
    attachmentsJson: JSON.stringify(Array.isArray(post.attachments) ? post.attachments : []),
    embedJson: JSON.stringify(post.embed ?? {}),
    tagsJson: JSON.stringify([]),
    prevPostId: null,
    nextPostId: null,
    favCount: 0,
    previewImageUrl: imagePath ?? post.file?.path ?? null,
    videoUrl: videoPath,
    thumbUrl: null,
    mediaType: videoPath ? "video" : imagePath ? "image" : null,
    authorName: null,
    rawPreviewPayload: JSON.stringify(post),
    rawDetailPayload: null,
    detailLevel: "preview",
    sourceKind: "upstream",
    isPopular: false,
    primaryPopularPeriod: null,
    primaryPopularDate: null,
    primaryPopularOffset: null,
    primaryPopularRank: null,
    popularContextsJson: null,
    longestVideoUrl: videoPath,
    longestVideoDurationSeconds: null,
    previewStatus: null,
    nativeThumbnailUrl: null,
    previewThumbnailAssetPath: null,
    previewClipAssetPath: null,
    previewGeneratedAt: null,
    previewError: null,
    previewSourceFingerprint: null,
    mediaMimeType: videoPath ? "video/mp4" : imagePath ? "image/jpeg" : null,
    mediaWidth: null,
    mediaHeight: null,
    cachedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    staleUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastSeenAt: new Date(),
  };
}

async function getSiteApi(site: KimonoSite) {
  if (site === "kemono") {
    return import("@/lib/api/kemono");
  }

  return import("@/lib/api/coomer");
}

async function resolveCreator(conn: Connection, site: KimonoSite, creatorId: string): Promise<{ creator: CreatorRow | null; source: "db" | "upstream" }> {
  const existing = await db.getCreatorBySiteAndId(conn, site, creatorId);
  if (existing) {
    return { creator: existing, source: "db" };
  }

  const catalog = await fetchAllCreatorsFromSite(site as Site);
  const upstreamCreator = catalog.find((entry) => String(entry.id) === creatorId);
  if (!upstreamCreator) {
    return { creator: null, source: "db" };
  }

  const inserted = mapCatalogCreatorToInsert(site, upstreamCreator);
  await db.upsertCreators(conn, [inserted]);
  const creator = await db.getCreatorById(conn, site, inserted.service, creatorId);
  return { creator, source: "upstream" };
}

async function warmCreatorProfile(conn: Connection, creator: CreatorRow): Promise<void> {
  if (creator.rawProfilePayload) {
    return;
  }

  const api = await getSiteApi(creator.site);
  const profile = await api.fetchCreatorProfile(creator.service, creator.creatorId);
  if (!profile) {
    return;
  }

  await db.updateCreatorProfile(conn, creator.site, creator.service, creator.creatorId, {
    rawProfilePayload: JSON.stringify(profile),
    profileCachedAt: new Date(),
    profileExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}

async function resolveCreatorPosts(
  conn: Connection,
  creator: CreatorRow,
  page: number,
): Promise<{ posts: PostRow[]; source: "db" | "upstream"; hasMore: boolean }> {
  const offset = (page - 1) * CREATOR_PAGE_SIZE;
  const currentRows = await db.getCreatorPosts(conn, creator.site, creator.service, creator.creatorId, offset, CREATOR_PAGE_SIZE + 1);
  if (currentRows.length > 0) {
    return {
      posts: currentRows.slice(0, CREATOR_PAGE_SIZE),
      source: "db",
      hasMore: currentRows.length > CREATOR_PAGE_SIZE,
    };
  }

  const api = await getSiteApi(creator.site);
  const upstreamPosts = await api.fetchCreatorPosts(creator.service, creator.creatorId, offset);
  if (upstreamPosts.length === 0) {
    return {
      posts: [],
      source: "db",
      hasMore: false,
    };
  }

  await db.upsertPosts(
    conn,
    upstreamPosts.map((post) => mapUpstreamPostToRow(creator.site, post)),
  );

  const refreshedRows = await db.getCreatorPosts(conn, creator.site, creator.service, creator.creatorId, offset, CREATOR_PAGE_SIZE + 1);
  return {
    posts: refreshedRows.slice(0, CREATOR_PAGE_SIZE),
    source: "upstream",
    hasMore: refreshedRows.length > CREATOR_PAGE_SIZE,
  };
}

export function parseCreatorPageParams(searchParams: Record<string, string | string[] | undefined> | URLSearchParams): ParsedCreatorPageParams {
  const value = searchParams instanceof URLSearchParams
    ? searchParams.get("page")
    : Array.isArray(searchParams.page)
      ? searchParams.page[0]
      : searchParams.page;

  return {
    page: normalizePage(value),
  };
}

export function buildCreatorHref(input: { site: KimonoSite; creatorId: string; page?: number }): string {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }
  const serialized = params.toString();
  return serialized
    ? `/creators/${input.site}/${input.creatorId}?${serialized}`
    : `/creators/${input.site}/${input.creatorId}`;
}

export async function getCreatorPageData(input: {
  site: string;
  creatorId: string;
  page: number;
}): Promise<CreatorPageData | null> {
  const site = normalizeSite(input.site);
  if (!site) {
    return null;
  }

  return withDbConnection(async (conn) => {
    const creatorResult = await resolveCreator(conn, site, input.creatorId);
    if (!creatorResult.creator) {
      return null;
    }

    await warmCreatorProfile(conn, creatorResult.creator).catch(() => undefined);
    const postsResult = await resolveCreatorPosts(conn, creatorResult.creator, input.page);

    return {
      creator: mapCreatorRowToProfileCard(creatorResult.creator),
      posts: postsResult.posts.map(mapPostRowToCreatorCard),
      page: input.page,
      hasMore: postsResult.hasMore,
      source: creatorResult.source === "upstream" || postsResult.source === "upstream" ? "upstream" : "db",
    };
  });
}
