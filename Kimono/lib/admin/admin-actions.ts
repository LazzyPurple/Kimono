import path from "node:path";
import { promises as fs } from "node:fs";

import { getDataStore, type SupportedSite } from "@/lib/db/index";
import { getGlobalUpstreamRateGuard, type UpstreamBucket } from "@/lib/api/upstream-rate-guard";
import { createHybridContentService } from "@/lib/hybrid-content";
import { fetchFavoritePosts as fetchKemonoFavoritePosts, fetchFavorites as fetchKemonoFavorites } from "@/lib/api/kemono";
import { fetchFavoritePosts as fetchCoomerFavoritePosts, fetchFavorites as fetchCoomerFavorites } from "@/lib/api/coomer";
import { hydratePostsWithMediaPlatform } from "@/lib/post-preview-hydration";
import { getPerformanceRepository } from "@/lib/db/index";
import { resolveMediaSourceCacheDir, resolvePreviewAssetDir } from "@/lib/popular-preview-assets";
import { purgeRebuildableDataOnStartup } from "@/lib/server/startup-db-maintenance.cjs";
import { runCreatorSync } from "@/lib/jobs/creator-sync";
import { withDbConnection } from "@/lib/db/index";
const hybridContent = createHybridContentService();

function isSafeWithin(root: string, candidatePath: string | null | undefined): boolean {
  if (!candidatePath) {
    return false;
  }

  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(candidatePath);
  return absolutePath === absoluteRoot || absolutePath.startsWith(`${absoluteRoot}${path.sep}`);
}

async function unlinkIfPresent(filePath: string | null | undefined) {
  if (!filePath) {
    return false;
  }

  try {
    await fs.rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function loadSiteFavoritePayload(site: SupportedSite, cookie: string) {
  if (site === "kemono") {
    const [creators, posts] = await Promise.all([
      fetchKemonoFavorites(cookie),
      fetchKemonoFavoritePosts(cookie),
    ]);
    return { creators, posts };
  }

  const [creators, posts] = await Promise.all([
    fetchCoomerFavorites(cookie),
    fetchCoomerFavoritePosts(cookie),
  ]);
  return { creators, posts };
}

export async function runAdminResetDb() {
  const summary = await purgeRebuildableDataOnStartup({
    env: process.env,
    workspaceRoot: process.cwd(),
    logger: console,
  });

  return {
    ok: true,
    summary,
    message: `Reset DB termine (${summary.tablesPurged.length} tables, ${summary.directoriesReset.length} dossiers).`,
  };
}

export async function runAdminCreatorIndexResync() {
  const results = await withDbConnection((conn) => runCreatorSync(conn as any, { force: true }));

  return {
    ok: true,
    summary: {
      results,
      refreshedSites: results.filter((entry) => entry.source === "upstream").map((entry) => entry.site),
    },
    message: `CreatorIndex re-synchronise (${results.length} site(s) traites).`,
  };
}

export async function runAdminPopularResync() {
  const result = await hybridContent.runPopularWarmupJob();
  return {
    ok: Boolean(result.ok),
    summary: result,
    message: result.ok ? "Snapshots Popular rafraichis." : "Popular re-sync termine avec erreurs.",
  };
}

export async function runAdminFavoritesResync() {
  const store = await getDataStore();
  const repository = await getPerformanceRepository();

  try {
    const results = await Promise.all(
      (["kemono", "coomer"] as const).map(async (site) => {
        const session = await store.getLatestKimonoSession(site);
        if (!session) {
          return { site, ok: false, reason: "missing-session", creators: 0, posts: 0 };
        }

        const live = await loadSiteFavoritePayload(site, session.cookie);
        const hydratedPosts = await hydratePostsWithMediaPlatform(
          live.posts.map((post, index) => ({ ...post, site, favoriteSourceIndex: index })),
          {
            repository,
            context: "favorites-posts",
            resolvePriorityClass: () => "liked",
          }
        );

        await Promise.all([
          store.setFavoriteSnapshot({
            kind: "creator",
            site,
            data: live.creators.map((creator) => ({ ...creator, site })),
            updatedAt: new Date(),
          }),
          store.setFavoriteSnapshot({
            kind: "post",
            site,
            data: hydratedPosts,
            updatedAt: new Date(),
          }),
        ]);

        return {
          site,
          ok: true,
          creators: live.creators.length,
          posts: hydratedPosts.length,
        };
      })
    );

    const ok = results.every((entry) => entry.ok);
    return {
      ok,
      results,
      message: ok ? "Snapshots favoris rafraichis." : "Favoris re-sync partiel.",
    };
  } finally {
    await Promise.all([store.disconnect(), repository.disconnect()]);
  }
}

export async function runAdminMediaPurge() {
  const repository = await getPerformanceRepository();
  const previewRoot = resolvePreviewAssetDir();
  const mediaRoot = resolveMediaSourceCacheDir();

  try {
    const now = new Date();
    const [previewEntries, mediaEntries] = await Promise.all([
      repository.listPreviewAssetCachesOlderThan({ cutoff: now }),
      repository.listExpiredMediaSourceCaches({ cutoff: now }),
    ]);

    let removedFiles = 0;

    for (const entry of previewEntries) {
      if (isSafeWithin(previewRoot, entry.thumbnailAssetPath)) {
        removedFiles += (await unlinkIfPresent(entry.thumbnailAssetPath)) ? 1 : 0;
      }
      if (isSafeWithin(previewRoot, entry.clipAssetPath)) {
        removedFiles += (await unlinkIfPresent(entry.clipAssetPath)) ? 1 : 0;
      }
    }

    for (const entry of mediaEntries) {
      if (isSafeWithin(mediaRoot, entry.localVideoPath)) {
        removedFiles += (await unlinkIfPresent(entry.localVideoPath)) ? 1 : 0;
      }
    }

    await Promise.all([
      repository.deletePreviewAssetCaches({
        entries: previewEntries.map((entry) => ({
          site: entry.site,
          sourceFingerprint: entry.sourceFingerprint,
        })),
      }),
      repository.deleteMediaSourceCaches({
        entries: mediaEntries.map((entry) => ({
          site: entry.site,
          sourceFingerprint: entry.sourceFingerprint,
        })),
      }),
    ]);

    return {
      ok: true,
      summary: {
        previewEntriesPurged: previewEntries.length,
        mediaEntriesPurged: mediaEntries.length,
        removedFiles,
      },
      message: "Media expires supprimes.",
    };
  } finally {
    await repository.disconnect();
  }
}

export async function runAdminClearCooldown(site: SupportedSite, bucket?: UpstreamBucket | null) {
  const guard = getGlobalUpstreamRateGuard();
  guard.clear(site, bucket ?? undefined);
  return {
    ok: true,
    site,
    bucket: bucket ?? null,
    message: bucket ? `Cooldown ${site}/${bucket} reset.` : `Tous les cooldowns ${site} ont ete resets.`,
  };
}



