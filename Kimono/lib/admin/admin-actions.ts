import { randomUUID } from "node:crypto";

import { appendAppLog } from "../app-logger.ts";
import { execute } from "../db.ts";
import { db, getDataStore, withDbConnection } from "../db/index.ts";
import { TTL } from "../config/ttl.ts";
import { getGlobalUpstreamRateGuard } from "../api/upstream-rate-guard.ts";
import { fetchPopularPostsFromSite, type PopularPeriod, type Site } from "../api/upstream.ts";
import { runCreatorSync } from "../jobs/creator-sync.ts";
import { getKimonoFavoritesPayload } from "../kimono-favorites-route.ts";
import { getLikesPostsPayload } from "../likes-posts-route.ts";

import type { Post } from "../api/kemono.ts";
import type { PostRow } from "../db/types.ts";

export const ADMIN_ACTION_KEYS = [
  "reset-db",
  "resync-creator-index",
  "resync-popular",
  "resync-favorites",
  "purge-media",
  "clear-cooldown",
] as const;

export type AdminActionKey = typeof ADMIN_ACTION_KEYS[number];

export interface AdminActionResult {
  ok: true;
  message: string;
  details?: Record<string, unknown>;
}

interface AdminActionsDependencies {
  resetDb?: () => Promise<AdminActionResult>;
  resyncCreatorIndex?: () => Promise<AdminActionResult>;
  resyncPopular?: () => Promise<AdminActionResult>;
  resyncFavorites?: () => Promise<AdminActionResult>;
  purgeMedia?: () => Promise<AdminActionResult>;
  clearCooldown?: () => Promise<AdminActionResult>;
}

const POPULAR_PERIODS: PopularPeriod[] = ["recent", "day", "week", "month"];
const POPULAR_SITES: Site[] = ["kemono", "coomer"];
const RESET_TABLES = ["Post", "MediaAsset", "MediaSource", "FavoriteCache", "DiscoveryCache"];

function normalizeDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectMediaType(post: Post): string | null {
  const candidates = [
    post.file?.path,
    ...((post.attachments ?? []).map((attachment) => attachment.path)),
  ].filter(Boolean) as string[];

  const firstVideo = candidates.find((candidate) => /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(candidate));
  if (firstVideo) {
    return "video";
  }

  const firstImage = candidates.find((candidate) => /\.(jpg|jpeg|png|gif|webp)$/i.test(candidate));
  if (firstImage) {
    return "image";
  }

  return null;
}

function mapPopularPostToRow(site: Site, period: PopularPeriod, date: string | null, offset: number, post: Post, index: number): PostRow {
  const now = new Date();

  return {
    site,
    service: post.service,
    creatorId: post.user,
    postId: post.id,
    title: post.title || null,
    contentHtml: post.content || null,
    excerpt: post.content ? String(post.content).replace(/<[^>]+>/g, " ").trim().slice(0, 240) : null,
    publishedAt: normalizeDate(post.published),
    addedAt: normalizeDate(post.added),
    editedAt: normalizeDate(post.edited),
    fileName: post.file?.name ?? null,
    filePath: post.file?.path ?? null,
    attachmentsJson: JSON.stringify(post.attachments ?? []),
    embedJson: JSON.stringify(post.embed ?? {}),
    tagsJson: null,
    prevPostId: null,
    nextPostId: null,
    favCount: 0,
    previewImageUrl: null,
    videoUrl: null,
    thumbUrl: null,
    mediaType: detectMediaType(post),
    authorName: null,
    rawPreviewPayload: JSON.stringify(post),
    rawDetailPayload: null,
    detailLevel: "preview",
    sourceKind: "popular",
    isPopular: true,
    primaryPopularPeriod: period,
    primaryPopularDate: date,
    primaryPopularOffset: offset,
    primaryPopularRank: offset + index + 1,
    popularContextsJson: JSON.stringify([
      {
        period,
        date,
        offset,
        rank: offset + index + 1,
      },
    ]),
    longestVideoUrl: null,
    longestVideoDurationSeconds: null,
    previewStatus: null,
    nativeThumbnailUrl: null,
    previewThumbnailAssetPath: null,
    previewClipAssetPath: null,
    previewGeneratedAt: null,
    previewError: null,
    previewSourceFingerprint: null,
    mediaMimeType: null,
    mediaWidth: null,
    mediaHeight: null,
    cachedAt: now,
    expiresAt: new Date(now.getTime() + TTL.post.popular),
    staleUntil: new Date(now.getTime() + TTL.post.stale),
    lastSeenAt: now,
  };
}

async function resetDb(): Promise<AdminActionResult> {
  for (const table of RESET_TABLES) {
    await execute(`DELETE FROM \`${table}\``);
  }

  await appendAppLog({
    source: "admin-action",
    level: "info",
    message: "Reset DB completed",
    details: { tables: RESET_TABLES.join(",") },
  });

  return {
    ok: true,
    message: "Caches reconstructibles purges.",
    details: { tables: RESET_TABLES },
  };
}

async function resyncCreatorIndex(): Promise<AdminActionResult> {
  const results = await withDbConnection((conn) => runCreatorSync(conn, { force: true }));
  return {
    ok: true,
    message: "CreatorIndex resynchronise.",
    details: { results },
  };
}

async function resyncPopular(): Promise<AdminActionResult> {
  const today = new Date().toISOString().slice(0, 10);
  let totalPosts = 0;

  await withDbConnection(async (conn) => {
    for (const site of POPULAR_SITES) {
      for (const period of POPULAR_PERIODS) {
        const date = period === "recent" ? null : today;
        const response = await fetchPopularPostsFromSite({
          site,
          period,
          date,
          offset: 0,
        });

        const rows = response.posts.map((post, index) => mapPopularPostToRow(site, period, date, 0, post, index));
        if (rows.length > 0) {
          await db.upsertPosts(conn, rows);
          totalPosts += rows.length;
        }
      }
    }
  });

  return {
    ok: true,
    message: "Popular refresh complete.",
    details: { totalPosts },
  };
}

async function resyncFavorites(): Promise<AdminActionResult> {
  const store = await getDataStore();
  try {
    const sessions = await store.getKimonoSessions();
    const sites = Array.from(new Set(sessions.map((session) => session.site)));

    const siteResults = [];
    for (const site of sites) {
      const [creators, posts] = await Promise.all([
        getKimonoFavoritesPayload({ site }),
        getLikesPostsPayload({ site }),
      ]);
      siteResults.push({
        site,
        creators: creators.favorites.length,
        posts: posts.items.length,
        expired: creators.expired || posts.expired,
      });
    }

    return {
      ok: true,
      message: "Favorites resynchronises.",
      details: { sites: siteResults },
    };
  } finally {
    await store.disconnect();
  }
}

async function purgeMedia(): Promise<AdminActionResult> {
  const details = await withDbConnection(async (conn) => {
    const [assetsDeleted, sourcesDeleted] = await Promise.all([
      db.deleteStaleMediaAssets(conn),
      db.deleteExpiredMediaSources(conn),
    ]);

    return { assetsDeleted, sourcesDeleted };
  });

  return {
    ok: true,
    message: "Media expire purges.",
    details,
  };
}

async function clearCooldown(): Promise<AdminActionResult> {
  const guard = getGlobalUpstreamRateGuard();
  guard.clear("coomer");

  return {
    ok: true,
    message: "Cooldown upstream Coomer efface.",
  };
}

export function createAdminActionsService(dependencies: AdminActionsDependencies = {}) {
  const handlers: Record<AdminActionKey, () => Promise<AdminActionResult>> = {
    "reset-db": dependencies.resetDb ?? resetDb,
    "resync-creator-index": dependencies.resyncCreatorIndex ?? resyncCreatorIndex,
    "resync-popular": dependencies.resyncPopular ?? resyncPopular,
    "resync-favorites": dependencies.resyncFavorites ?? resyncFavorites,
    "purge-media": dependencies.purgeMedia ?? purgeMedia,
    "clear-cooldown": dependencies.clearCooldown ?? clearCooldown,
  };

  return {
    async run(action: AdminActionKey): Promise<AdminActionResult> {
      return handlers[action]();
    },
  };
}

export async function runAdminAction(action: AdminActionKey) {
  return createAdminActionsService().run(action);
}
