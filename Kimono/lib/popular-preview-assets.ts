import path from "node:path";
import { createHash } from "node:crypto";

import type { Site } from "./api/helpers.ts";

const DEFAULT_PREVIEW_ASSET_DIR = path.join(process.cwd(), "tmp", "preview-assets");
const DEFAULT_MEDIA_SOURCE_CACHE_DIR = path.join(process.cwd(), "tmp", "media-source-cache");
const DEFAULT_PREVIEW_RETENTION_DAYS = 7;

export type PreviewGenerationStrategy = "full" | "thumbnail-first";

export interface PreparedPopularPreview {
  longestVideoUrl: string | null;
  longestVideoDurationSeconds: number | null;
  previewThumbnailAssetPath: string | null;
  previewClipAssetPath: string | null;
  previewStatus: string;
  previewGeneratedAt: Date | null;
  previewError: string | null;
  previewSourceFingerprint: string | null;
  previewOutcome: "missing";
}

export function getPopularPreviewRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.POPULAR_PREVIEW_RETENTION_DAYS);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : DEFAULT_PREVIEW_RETENTION_DAYS;
}

export function resolvePreviewAssetDir(env: NodeJS.ProcessEnv = process.env, workspaceRoot = process.cwd()): string {
  const configured = env.PREVIEW_ASSET_DIR?.trim();
  if (!configured) {
    return path.resolve(workspaceRoot, DEFAULT_PREVIEW_ASSET_DIR);
  }

  return path.isAbsolute(configured) ? configured : path.resolve(workspaceRoot, configured);
}

export function resolveMediaSourceCacheDir(env: NodeJS.ProcessEnv = process.env, workspaceRoot = process.cwd()): string {
  const configured = env.MEDIA_SOURCE_CACHE_DIR?.trim();
  if (!configured) {
    return path.resolve(workspaceRoot, DEFAULT_MEDIA_SOURCE_CACHE_DIR);
  }

  return path.isAbsolute(configured) ? configured : path.resolve(workspaceRoot, configured);
}

export function normalizePreviewSourceUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

export function createPreviewSourceFingerprint(site: Site, sourceUrl: string): string {
  return createHash("sha256")
    .update(`${site}:${normalizePreviewSourceUrl(sourceUrl)}`)
    .digest("hex")
    .slice(0, 24);
}

export function buildPreviewAssetPublicUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) {
    return null;
  }

  return `/api/media/preview/${relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function buildMediaSourcePublicUrl(site: Site, sourceFingerprint: string): string {
  return `/api/media/${encodeURIComponent(site)}/${encodeURIComponent(sourceFingerprint)}`;
}

export function createPopularPreviewAssetService() {
  return {
    async preparePreviewForPost(): Promise<PreparedPopularPreview> {
      return {
        longestVideoUrl: null,
        longestVideoDurationSeconds: null,
        previewThumbnailAssetPath: null,
        previewClipAssetPath: null,
        previewStatus: "missing",
        previewGeneratedAt: null,
        previewError: null,
        previewSourceFingerprint: null,
        previewOutcome: "missing",
      };
    },
    async cleanupPreviewAssets() {
      return { deletedEntries: 0 };
    },
  };
}
