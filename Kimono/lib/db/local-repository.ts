import * as prodRepository from "./repository.ts";
import type {
  CreatorRow,
  DiscoveryBlockRow,
  DiscoveryCacheRow,
  FavoriteCacheRow,
  FavoriteChronologyRow,
  FavoriteKind,
  InsertCreatorRow,
  KimonoSessionRow,
  KimonoSite,
  MediaAssetRow,
  MediaSourceRow,
  PostRow,
  SearchCreatorsOpts,
  SearchCreatorsResult,
} from "./types.ts";

let prismaClientPromise: Promise<any> | undefined;

async function getPrismaClient() {
  if (!prismaClientPromise) {
    prismaClientPromise = (async () => {
      const prismaModule = await import("@prisma/client");
      const PrismaClientCtor = (prismaModule as any).PrismaClient
        ?? (prismaModule as any).default?.PrismaClient
        ?? (prismaModule as any).default;
      return new PrismaClientCtor();
    })();
  }
  return prismaClientPromise;
}

async function getSqliteConnectionLike(): Promise<any> {
  const prisma = await getPrismaClient();
  return {
    async query(sql: string, values?: unknown[]) {
      return [await prisma.$queryRawUnsafe(sql, ...(values ?? []))] as const;
    },
    async execute(sql: string, values?: unknown[]) {
      return [{ affectedRows: Number(await prisma.$executeRawUnsafe(sql, ...(values ?? []))) || 0 }] as const;
    },
  };
}

export async function searchCreators(_conn: unknown, opts: SearchCreatorsOpts): Promise<SearchCreatorsResult> { return prodRepository.searchCreators(await getSqliteConnectionLike(), opts); }
export async function getCreatorById(_conn: unknown, site: KimonoSite, service: string, creatorId: string): Promise<CreatorRow | null> { return prodRepository.getCreatorById(await getSqliteConnectionLike(), site, service, creatorId); }
export async function upsertCreators(_conn: unknown, creators: InsertCreatorRow[]): Promise<{ inserted: number; updated: number }> { return prodRepository.upsertCreators(await getSqliteConnectionLike(), creators); }
export async function archiveStaleCreators(_conn: unknown, site: KimonoSite, activeIds: Array<{ service: string; creatorId: string }>): Promise<number> { return prodRepository.archiveStaleCreators(await getSqliteConnectionLike(), site, activeIds); }
export async function updateCreatorProfile(_conn: unknown, site: KimonoSite, service: string, creatorId: string, data: Pick<CreatorRow, "rawProfilePayload" | "profileCachedAt" | "profileExpiresAt">): Promise<void> { return prodRepository.updateCreatorProfile(await getSqliteConnectionLike(), site, service, creatorId, data); }
export async function isCreatorCatalogFresh(_conn: unknown, site: KimonoSite): Promise<boolean> { return prodRepository.isCreatorCatalogFresh(await getSqliteConnectionLike(), site); }
export async function getPostById(_conn: unknown, site: KimonoSite, service: string, creatorId: string, postId: string): Promise<PostRow | null> { return prodRepository.getPostById(await getSqliteConnectionLike(), site, service, creatorId, postId); }
export async function getCreatorPosts(_conn: unknown, site: KimonoSite, service: string, creatorId: string, offset: number, limit?: number): Promise<PostRow[]> { return prodRepository.getCreatorPosts(await getSqliteConnectionLike(), site, service, creatorId, offset, limit); }
export async function upsertPost(_conn: unknown, post: PostRow): Promise<void> { return prodRepository.upsertPost(await getSqliteConnectionLike(), post); }
export async function upsertPosts(_conn: unknown, posts: PostRow[]): Promise<void> { return prodRepository.upsertPosts(await getSqliteConnectionLike(), posts); }
export async function getPopularPosts(_conn: unknown, site: KimonoSite, period: "recent" | "day" | "week" | "month", date?: string, offset?: number, limit?: number): Promise<PostRow[]> { return prodRepository.getPopularPosts(await getSqliteConnectionLike(), site, period, date, offset, limit); }
export async function deleteExpiredPosts(_conn: unknown): Promise<number> { return prodRepository.deleteExpiredPosts(await getSqliteConnectionLike()); }
export async function getMediaAsset(_conn: unknown, site: KimonoSite, sourceFingerprint: string): Promise<MediaAssetRow | null> { return prodRepository.getMediaAsset(await getSqliteConnectionLike(), site, sourceFingerprint); }
export async function upsertMediaAsset(_conn: unknown, asset: MediaAssetRow): Promise<void> { return prodRepository.upsertMediaAsset(await getSqliteConnectionLike(), asset); }
export async function updateMediaAssetStatus(_conn: unknown, site: KimonoSite, sourceFingerprint: string, data: Partial<Pick<MediaAssetRow, "probeStatus" | "previewStatus" | "thumbnailAssetPath" | "clipAssetPath" | "generationAttempts" | "lastError" | "retryAfter" | "hotUntil" | "nativeThumbnailUrl" | "mediaKind" | "mimeType" | "width" | "height" | "durationSeconds" | "lastSeenAt">>): Promise<void> { return prodRepository.updateMediaAssetStatus(await getSqliteConnectionLike(), site, sourceFingerprint, data); }
export async function deleteStaleMediaAssets(_conn: unknown): Promise<number> { return prodRepository.deleteStaleMediaAssets(await getSqliteConnectionLike()); }
export async function getMediaSource(_conn: unknown, site: KimonoSite, sourceFingerprint: string): Promise<MediaSourceRow | null> { return prodRepository.getMediaSource(await getSqliteConnectionLike(), site, sourceFingerprint); }
export async function upsertMediaSource(_conn: unknown, source: MediaSourceRow): Promise<void> { return prodRepository.upsertMediaSource(await getSqliteConnectionLike(), source); }
export async function updateMediaSourceDownload(_conn: unknown, site: KimonoSite, sourceFingerprint: string, data: Partial<Pick<MediaSourceRow, "downloadStatus" | "downloadedAt" | "localPath" | "fileSizeBytes" | "downloadError" | "downloadAttempts" | "retryAfter">>): Promise<void> { return prodRepository.updateMediaSourceDownload(await getSqliteConnectionLike(), site, sourceFingerprint, data); }
export async function deleteExpiredMediaSources(_conn: unknown): Promise<number> { return prodRepository.deleteExpiredMediaSources(await getSqliteConnectionLike()); }
export async function getFavoriteChronology(_conn: unknown, kind: FavoriteKind, site: KimonoSite): Promise<FavoriteChronologyRow[]> { return prodRepository.getFavoriteChronology(await getSqliteConnectionLike(), kind, site); }
export async function upsertFavoriteChronologyEntry(_conn: unknown, entry: FavoriteChronologyRow): Promise<void> { return prodRepository.upsertFavoriteChronologyEntry(await getSqliteConnectionLike(), entry); }
export async function deleteFavoriteChronologyEntry(_conn: unknown, kind: FavoriteKind, site: KimonoSite, service: string, creatorId: string, postId?: string): Promise<void> { return prodRepository.deleteFavoriteChronologyEntry(await getSqliteConnectionLike(), kind, site, service, creatorId, postId); }
export async function getFavoriteCache(_conn: unknown, kind: FavoriteKind, site: KimonoSite): Promise<FavoriteCacheRow | null> { return prodRepository.getFavoriteCache(await getSqliteConnectionLike(), kind, site); }
export async function upsertFavoriteCache(_conn: unknown, entry: FavoriteCacheRow): Promise<void> { return prodRepository.upsertFavoriteCache(await getSqliteConnectionLike(), entry); }
export async function getDiscoveryCache(_conn: unknown, site: KimonoSite | "global"): Promise<DiscoveryCacheRow | null> { return prodRepository.getDiscoveryCache(await getSqliteConnectionLike(), site); }
export async function upsertDiscoveryCache(_conn: unknown, entry: DiscoveryCacheRow): Promise<void> { return prodRepository.upsertDiscoveryCache(await getSqliteConnectionLike(), entry); }
export async function getDiscoveryBlocks(_conn: unknown, site: KimonoSite): Promise<DiscoveryBlockRow[]> { return prodRepository.getDiscoveryBlocks(await getSqliteConnectionLike(), site); }
export async function upsertDiscoveryBlock(_conn: unknown, block: DiscoveryBlockRow): Promise<void> { return prodRepository.upsertDiscoveryBlock(await getSqliteConnectionLike(), block); }
export async function deleteDiscoveryBlock(_conn: unknown, site: KimonoSite, service: string, creatorId: string): Promise<void> { return prodRepository.deleteDiscoveryBlock(await getSqliteConnectionLike(), site, service, creatorId); }
export async function getLatestKimonoSession(_conn: unknown, site: KimonoSite): Promise<KimonoSessionRow | null> { return prodRepository.getLatestKimonoSession(await getSqliteConnectionLike(), site); }
export async function upsertKimonoSession(_conn: unknown, session: KimonoSessionRow): Promise<void> { return prodRepository.upsertKimonoSession(await getSqliteConnectionLike(), session); }
export async function deleteKimonoSession(_conn: unknown, site: KimonoSite): Promise<void> { return prodRepository.deleteKimonoSession(await getSqliteConnectionLike(), site); }
