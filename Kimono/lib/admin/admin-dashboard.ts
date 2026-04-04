import path from "node:path";
import { promises as fs } from "node:fs";

import { query } from "../db.ts";
import { getServerHealthPayload } from "../server-health.ts";

type ServerHealthPayload = Awaited<ReturnType<typeof getServerHealthPayload>>;

export interface AdminDashboardSnapshot {
  runtime: {
    databaseDriver: string | null;
    ffmpegStatus: string | null;
    ffprobeStatus: string | null;
  };
  cards: {
    kemonoCreators: number;
    coomerCreators: number;
    activeSessions: number;
    generatedPreviews: number;
    cachedVideoSources: number;
    mediaDiskBytes: number;
  };
  creatorSync: ServerHealthPayload["creatorIndex"];
  favorites: ServerHealthPayload["favorites"];
  discovery: ServerHealthPayload["discovery"];
  upstreamCooldowns: ServerHealthPayload["upstreamCooldowns"];
  bootPolicy: string;
}

type CountSnapshot = {
  kemonoCreators: number;
  coomerCreators: number;
  activeSessions: number;
};

interface AdminDashboardDependencies {
  getServerHealth?: () => Promise<ServerHealthPayload>;
  getCounts?: () => Promise<CountSnapshot>;
  getMediaDiskUsage?: () => Promise<number>;
  getBootPolicyLabel?: () => string;
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveBootPolicyLabel(env: NodeJS.ProcessEnv = process.env): string {
  const startupResetEnabled = parseBooleanFlag(env.STARTUP_DB_RESET ?? env.RESET_DB_ON_STARTUP);
  return startupResetEnabled ? "startup-db-reset-enabled" : "manual-db-reset-only";
}

async function calculateDirectorySize(targetPath: string): Promise<number> {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return stats.size;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += await calculateDirectorySize(entryPath);
      continue;
    }

    if (entry.isFile()) {
      const stats = await fs.stat(entryPath);
      total += stats.size;
    }
  }

  return total;
}

async function getMediaDiskUsage(): Promise<number> {
  const workspaceRoot = process.cwd();
  const previewDir = process.env.PREVIEW_ASSET_DIR?.trim()
    ? path.resolve(workspaceRoot, process.env.PREVIEW_ASSET_DIR.trim())
    : path.join(workspaceRoot, "tmp", "preview-assets");
  const mediaDir = process.env.MEDIA_SOURCE_CACHE_DIR?.trim()
    ? path.resolve(workspaceRoot, process.env.MEDIA_SOURCE_CACHE_DIR.trim())
    : path.join(workspaceRoot, "tmp", "media-source-cache");

  const [previewBytes, mediaBytes] = await Promise.all([
    calculateDirectorySize(previewDir),
    calculateDirectorySize(mediaDir),
  ]);

  return previewBytes + mediaBytes;
}

async function getCounts(): Promise<CountSnapshot> {
  const [creatorRows, sessionRows] = await Promise.all([
    query<{ site: string; total: number }>(
      "SELECT site, COUNT(*) AS total FROM `Creator` WHERE archivedAt IS NULL GROUP BY site",
    ),
    query<{ total: number }>(
      "SELECT COUNT(*) AS total FROM `Session` WHERE expiresAt > CURRENT_TIMESTAMP",
    ),
  ]);

  const totalsBySite = new Map(
    creatorRows.map((row) => [String(row.site), Number(row.total ?? 0)]),
  );

  return {
    kemonoCreators: totalsBySite.get("kemono") ?? 0,
    coomerCreators: totalsBySite.get("coomer") ?? 0,
    activeSessions: Number(sessionRows[0]?.total ?? 0),
  };
}

export function createAdminDashboardService(dependencies: AdminDashboardDependencies = {}) {
  return {
    async getSnapshot(): Promise<AdminDashboardSnapshot> {
      const [health, counts, mediaDiskBytes] = await Promise.all([
        (dependencies.getServerHealth ?? getServerHealthPayload)(),
        (dependencies.getCounts ?? getCounts)(),
        (dependencies.getMediaDiskUsage ?? getMediaDiskUsage)(),
      ]);

      return {
        runtime: {
          databaseDriver: health.runtime?.database?.driver ?? null,
          ffmpegStatus: health.runtime?.previewTools?.ffmpeg?.status ?? null,
          ffprobeStatus: health.runtime?.previewTools?.ffprobe?.status ?? null,
        },
        cards: {
          kemonoCreators: counts.kemonoCreators,
          coomerCreators: counts.coomerCreators,
          activeSessions: counts.activeSessions,
          generatedPreviews: Number(health.previews?.readyEntries ?? 0),
          cachedVideoSources: Number(health.mediaSources?.readyEntries ?? 0),
          mediaDiskBytes,
        },
        creatorSync: health.creatorIndex,
        favorites: health.favorites,
        discovery: health.discovery,
        upstreamCooldowns: health.upstreamCooldowns,
        bootPolicy: (dependencies.getBootPolicyLabel ?? resolveBootPolicyLabel)(),
      };
    },
  };
}

export async function getAdminDashboardData() {
  return createAdminDashboardService().getSnapshot();
}
