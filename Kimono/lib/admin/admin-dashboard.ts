import path from "node:path";
import { promises as fs } from "node:fs";

import { getDataStore } from "@/lib/db/index";
import { getServerHealthPayload } from "@/lib/server-health";
import { TTL } from "@/lib/config/ttl";
import { resolveMediaSourceCacheDir, resolvePreviewAssetDir } from "@/lib/popular-preview-assets";

async function safeDirectorySize(directoryPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const sizes = await Promise.all(entries.map(async (entry) => {
      const absolutePath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return safeDirectorySize(absolutePath);
      }
      if (!entry.isFile()) {
        return 0;
      }
      const stat = await fs.stat(absolutePath).catch(() => null);
      return stat?.size ?? 0;
    }));
    return sizes.reduce((total, value) => total + value, 0);
  } catch {
    return 0;
  }
}

export async function getAdminDashboardData() {
  const [health, store, previewDiskBytes, mediaDiskBytes] = await Promise.all([
    getServerHealthPayload(),
    getDataStore(),
    safeDirectorySize(resolvePreviewAssetDir()),
    safeDirectorySize(resolveMediaSourceCacheDir()),
  ]);

  try {
    const [sessions, adminUser] = await Promise.all([
      store.getKimonoSessions(),
      store.getOrCreateAdminUser(),
    ]);

    const alerts: Array<{ level: "warn" | "error"; title: string; message: string }> = [];

    if ((health.creatorIndex.kemono?.total ?? 0) < 100_000) {
      alerts.push({
        level: "warn",
        title: "Index Kemono incomplet",
        message: "Le total creators Kemono semble trop bas pour un catalogue complet.",
      });
    }

    if ((health.creatorIndex.coomer?.total ?? 0) < 20_000) {
      alerts.push({
        level: "warn",
        title: "Index Coomer incomplet",
        message: "Le total creators Coomer semble trop bas pour un catalogue complet.",
      });
    }

    if (health.upstreamCooldowns.length > 0) {
      alerts.push({
        level: "warn",
        title: "Cooldown upstream actif",
        message: `${health.upstreamCooldowns.length} bucket(s) upstream sont actuellement bloques.`,
      });
    }

    if (health.runtime.previewTools.ffmpeg.status !== "available") {
      alerts.push({
        level: "error",
        title: "FFmpeg indisponible",
        message: "La generation des previews et certains flux video ne seront pas complets.",
      });
    }

    if (health.runtime.previewTools.ffprobe.status !== "available") {
      alerts.push({
        level: "error",
        title: "FFprobe indisponible",
        message: "Les analyses media detaillees seront degradees.",
      });
    }

    return {
      health,
      sessions,
      adminUser,
      disk: {
        previewDiskBytes,
        mediaDiskBytes,
        totalDiskBytes: previewDiskBytes + mediaDiskBytes,
      },
      serviceStatus: {
        databaseDriver: health.runtime.database.driver ?? "unknown",
        ffmpegStatus: health.runtime.previewTools.ffmpeg.status,
        ffprobeStatus: health.runtime.previewTools.ffprobe.status,
        bootSequenceStatus: "creator-warmup-enabled / manual-db-reset-only",
        creatorRefreshIntervalMs: TTL.creator.syncInterval,
      },
      alerts,
    };
  } finally {
    await store.disconnect();
  }
}


