import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";

import { getPostVideoUrls, type UnifiedPost } from "./api/helpers.ts";
import { appendAppLog, logAppError } from "./app-logger.ts";
import type {
  PerformanceRepository,
  PreviewAssetCacheInput,
  PreviewAssetCacheRecord,
  Site,
} from "./perf-repository.ts";

const DEFAULT_PREVIEW_ASSET_DIR = path.join(process.cwd(), "tmp", "preview-assets");
const DEFAULT_PREVIEW_RETENTION_DAYS = 7;
const DEFAULT_PREVIEW_CLIP_SECONDS = 3;
const DURATION_PATTERN = /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/i;

export type PreparedPopularPreviewOutcome = "not-video" | "reused" | "generated" | "skipped-no-ffmpeg" | "failed" | "missing";

export interface PreparedPopularPreview {
  longestVideoUrl: string | null;
  longestVideoDurationSeconds: number | null;
  previewThumbnailAssetPath: string | null;
  previewClipAssetPath: string | null;
  previewStatus: string;
  previewGeneratedAt: Date | null;
  previewError: string | null;
  previewSourceFingerprint: string | null;
  previewOutcome: PreparedPopularPreviewOutcome;
}

interface VideoAnalysisResult {
  durationSeconds: number | null;
}

interface GeneratedPreviewAssets {
  thumbnailAssetPath: string | null;
  clipAssetPath: string | null;
}

interface PopularPreviewAssetDependencies {
  repository: Pick<
    PerformanceRepository,
    | "getPreviewAssetCache"
    | "upsertPreviewAssetCache"
    | "touchPreviewAssetCache"
    | "listPreviewAssetCachesOlderThan"
    | "deletePreviewAssetCaches"
  >;
  previewAssetDir?: string;
  clipDurationSeconds?: number;
  analyzeVideoSource?: (input: { site: Site; sourceVideoUrl: string }) => Promise<VideoAnalysisResult>;
  generatePreviewAssets?: (input: {
    site: Site;
    sourceVideoUrl: string;
    sourceFingerprint: string;
    assetDir: string;
    paths: GeneratedPreviewAssets;
    durationSeconds: number | null;
    clipDurationSeconds: number;
  }) => Promise<GeneratedPreviewAssets>;
  fileExists?: (relativePath: string, assetDir: string) => Promise<boolean>;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function getPopularPreviewRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.POPULAR_PREVIEW_RETENTION_DAYS, DEFAULT_PREVIEW_RETENTION_DAYS);
}

export function getPopularPreviewClipSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.POPULAR_PREVIEW_CLIP_SECONDS, DEFAULT_PREVIEW_CLIP_SECONDS);
}

export function resolvePreviewAssetDir(env: NodeJS.ProcessEnv = process.env, workspaceRoot = process.cwd()): string {
  const configuredPath = env.PREVIEW_ASSET_DIR?.trim();
  if (!configuredPath) {
    return path.resolve(workspaceRoot, DEFAULT_PREVIEW_ASSET_DIR);
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(workspaceRoot, configuredPath);
}

export function normalizePreviewSourceUrl(sourceVideoUrl: string): string {
  const url = new URL(sourceVideoUrl);
  const sortedParams = new URLSearchParams([...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right)));
  url.hash = "";
  url.search = sortedParams.toString() ? `?${sortedParams.toString()}` : "";
  return url.toString();
}

export function createPreviewSourceFingerprint(site: Site, sourceVideoUrl: string): string {
  return createHash("sha256")
    .update(`${site}:${normalizePreviewSourceUrl(sourceVideoUrl)}`)
    .digest("hex")
    .slice(0, 24);
}

export function getPreviewAssetRelativePaths(site: Site, sourceFingerprint: string): GeneratedPreviewAssets {
  return {
    thumbnailAssetPath: `popular/${site}/${sourceFingerprint}/thumb.webp`,
    clipAssetPath: `popular/${site}/${sourceFingerprint}/clip.mp4`,
  };
}

export function buildPreviewAssetPublicUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) {
    return null;
  }

  return `/api/preview-assets/${relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function defaultFileExists(relativePath: string, assetDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(assetDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function resolveFfmpegPath(): Promise<string | null> {
  if (process.env.FFMPEG_PATH?.trim()) {
    return process.env.FFMPEG_PATH.trim();
  }

  try {
    const module = await import("ffmpeg-static");
    const candidateModule = module as unknown as string | { default?: string };
    const candidate = typeof candidateModule === "string" ? candidateModule : candidateModule.default ?? null;
    return typeof candidate === "string" && candidate.trim() ? candidate : null;
  } catch {
    return null;
  }
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`ffmpeg exited with code ${code}`);
      (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
      (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
      reject(error);
    });
  });
}

async function defaultAnalyzeVideoSource(input: { sourceVideoUrl: string }): Promise<VideoAnalysisResult> {
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    return { durationSeconds: null };
  }

  try {
    const { stderr } = await runFfmpeg(ffmpegPath, ["-i", input.sourceVideoUrl, "-f", "null", "-"]);
    const match = stderr.match(DURATION_PATTERN);
    if (!match) {
      return { durationSeconds: null };
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    return {
      durationSeconds: hours * 3600 + minutes * 60 + seconds,
    };
  } catch {
    return { durationSeconds: null };
  }
}

async function defaultGeneratePreviewAssets(input: {
  sourceVideoUrl: string;
  sourceFingerprint: string;
  assetDir: string;
  paths: GeneratedPreviewAssets;
  durationSeconds: number | null;
  clipDurationSeconds: number;
}): Promise<GeneratedPreviewAssets> {
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new Error("FFmpeg is unavailable");
  }

  const thumbAbsolutePath = path.join(input.assetDir, input.paths.thumbnailAssetPath ?? "");
  const clipAbsolutePath = path.join(input.assetDir, input.paths.clipAssetPath ?? "");
  await fs.mkdir(path.dirname(thumbAbsolutePath), { recursive: true });
  await fs.mkdir(path.dirname(clipAbsolutePath), { recursive: true });

  const duration = input.durationSeconds ?? 0;
  const thumbOffsetSeconds = duration > 6 ? Math.min(3, Math.max(1, Math.floor(duration * 0.15))) : 1;
  const clipOffsetSeconds = duration > input.clipDurationSeconds + 2
    ? Math.max(1, Math.floor(duration * 0.2))
    : 0;

  await runFfmpeg(ffmpegPath, [
    "-y",
    "-ss",
    String(thumbOffsetSeconds),
    "-i",
    input.sourceVideoUrl,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(640,iw)':-2",
    thumbAbsolutePath,
  ]);

  await runFfmpeg(ffmpegPath, [
    "-y",
    "-ss",
    String(clipOffsetSeconds),
    "-i",
    input.sourceVideoUrl,
    "-t",
    String(input.clipDurationSeconds),
    "-an",
    "-vf",
    "fps=12,scale='min(640,iw)':-2",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    clipAbsolutePath,
  ]);

  return input.paths;
}

function chooseLongestVideoCandidate(candidates: Array<{ url: string; durationSeconds: number | null; fingerprint: string; existing: PreviewAssetCacheRecord | null }>) {
  return candidates
    .slice()
    .sort((left, right) => {
      const leftDuration = left.durationSeconds ?? -1;
      const rightDuration = right.durationSeconds ?? -1;
      if (leftDuration === rightDuration) {
        return left.url.localeCompare(right.url);
      }
      return rightDuration - leftDuration;
    })[0] ?? null;
}

export function createPopularPreviewAssetService(dependencies: PopularPreviewAssetDependencies) {
  const assetDir = dependencies.previewAssetDir ?? resolvePreviewAssetDir();
  const analyzeVideoSource = dependencies.analyzeVideoSource ?? defaultAnalyzeVideoSource;
  const generatePreviewAssets = dependencies.generatePreviewAssets ?? defaultGeneratePreviewAssets;
  const fileExists = dependencies.fileExists ?? defaultFileExists;
  const clipDurationSeconds = dependencies.clipDurationSeconds ?? getPopularPreviewClipSeconds();

  return {
    async preparePreviewForPost(input: { site: Site; post: UnifiedPost; now?: Date }): Promise<PreparedPopularPreview> {
      const now = input.now ?? new Date();
      const videoUrls = Array.from(new Set(getPostVideoUrls(input.post)));
      if (videoUrls.length === 0) {
        return {
          longestVideoUrl: null,
          longestVideoDurationSeconds: null,
          previewThumbnailAssetPath: null,
          previewClipAssetPath: null,
          previewStatus: "not-video",
          previewGeneratedAt: null,
          previewError: null,
          previewSourceFingerprint: null,
          previewOutcome: "not-video",
        };
      }

      const candidates = [] as Array<{ url: string; durationSeconds: number | null; fingerprint: string; existing: PreviewAssetCacheRecord | null; shouldPersistMetadataOnly: boolean }>;
      for (const url of videoUrls) {
        const fingerprint = createPreviewSourceFingerprint(input.site, url);
        const existing = await dependencies.repository.getPreviewAssetCache({
          site: input.site,
          sourceFingerprint: fingerprint,
        });

        let durationSeconds = existing?.durationSeconds ?? null;
        let shouldPersistMetadataOnly = false;
        if (durationSeconds == null) {
          const analysis = await analyzeVideoSource({ site: input.site, sourceVideoUrl: url });
          durationSeconds = analysis.durationSeconds ?? null;
          shouldPersistMetadataOnly = !existing && durationSeconds != null;
        }

        candidates.push({ url, durationSeconds, fingerprint, existing, shouldPersistMetadataOnly });
      }

      const chosenCandidate = chooseLongestVideoCandidate(candidates);
      if (!chosenCandidate) {
        return {
          longestVideoUrl: videoUrls[0] ?? null,
          longestVideoDurationSeconds: null,
          previewThumbnailAssetPath: null,
          previewClipAssetPath: null,
          previewStatus: "missing",
          previewGeneratedAt: null,
          previewError: null,
          previewSourceFingerprint: null,
          previewOutcome: "missing",
        };
      }

      await Promise.all(
        candidates
          .filter((candidate) => candidate.shouldPersistMetadataOnly && candidate.fingerprint !== chosenCandidate.fingerprint)
          .map((candidate) =>
            dependencies.repository.upsertPreviewAssetCache({
              site: input.site,
              sourceVideoUrl: candidate.url,
              sourceFingerprint: candidate.fingerprint,
              durationSeconds: candidate.durationSeconds,
              thumbnailAssetPath: null,
              clipAssetPath: null,
              status: "metadata-only",
              generatedAt: now,
              lastSeenAt: now,
              error: null,
            })
          )
      );

      const previewPaths = getPreviewAssetRelativePaths(input.site, chosenCandidate.fingerprint);
      const existingRecord = chosenCandidate.existing;
      const hasReusableAssets = existingRecord?.status === "ready"
        && Boolean(existingRecord.thumbnailAssetPath)
        && Boolean(existingRecord.clipAssetPath)
        && await fileExists(existingRecord.thumbnailAssetPath!, assetDir)
        && await fileExists(existingRecord.clipAssetPath!, assetDir);

      if (hasReusableAssets) {
        await dependencies.repository.touchPreviewAssetCache({
          site: input.site,
          sourceFingerprint: chosenCandidate.fingerprint,
          lastSeenAt: now,
        });

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: existingRecord?.thumbnailAssetPath ?? null,
          previewClipAssetPath: existingRecord?.clipAssetPath ?? null,
          previewStatus: "ready",
          previewGeneratedAt: existingRecord?.generatedAt ?? now,
          previewError: null,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: "reused",
        };
      }

      const ffmpegPath = await resolveFfmpegPath();
      if (!ffmpegPath) {
        await dependencies.repository.upsertPreviewAssetCache({
          site: input.site,
          sourceVideoUrl: chosenCandidate.url,
          sourceFingerprint: chosenCandidate.fingerprint,
          durationSeconds: chosenCandidate.durationSeconds,
          thumbnailAssetPath: existingRecord?.thumbnailAssetPath ?? null,
          clipAssetPath: existingRecord?.clipAssetPath ?? null,
          status: "skipped-no-ffmpeg",
          generatedAt: now,
          lastSeenAt: now,
          error: "FFmpeg unavailable",
        });

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: existingRecord?.thumbnailAssetPath ?? null,
          previewClipAssetPath: existingRecord?.clipAssetPath ?? null,
          previewStatus: "skipped-no-ffmpeg",
          previewGeneratedAt: now,
          previewError: "FFmpeg unavailable",
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: "skipped-no-ffmpeg",
        };
      }

      try {
        const generatedAssets = await generatePreviewAssets({
          site: input.site,
          sourceVideoUrl: chosenCandidate.url,
          sourceFingerprint: chosenCandidate.fingerprint,
          assetDir,
          paths: previewPaths,
          durationSeconds: chosenCandidate.durationSeconds,
          clipDurationSeconds,
        });

        const record: PreviewAssetCacheInput = {
          site: input.site,
          sourceVideoUrl: chosenCandidate.url,
          sourceFingerprint: chosenCandidate.fingerprint,
          durationSeconds: chosenCandidate.durationSeconds,
          thumbnailAssetPath: generatedAssets.thumbnailAssetPath,
          clipAssetPath: generatedAssets.clipAssetPath,
          status: "ready",
          generatedAt: now,
          lastSeenAt: now,
          error: null,
        };
        await dependencies.repository.upsertPreviewAssetCache(record);

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: record.thumbnailAssetPath ?? null,
          previewClipAssetPath: record.clipAssetPath ?? null,
          previewStatus: "ready",
          previewGeneratedAt: now,
          previewError: null,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: "generated",
        };
      } catch (error) {
        await logAppError("preview", "popular preview generation failed", error, {
          details: {
            site: input.site,
            sourceFingerprint: chosenCandidate.fingerprint,
            sourceVideoUrl: chosenCandidate.url,
          },
        });
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.repository.upsertPreviewAssetCache({
          site: input.site,
          sourceVideoUrl: chosenCandidate.url,
          sourceFingerprint: chosenCandidate.fingerprint,
          durationSeconds: chosenCandidate.durationSeconds,
          thumbnailAssetPath: null,
          clipAssetPath: null,
          status: "failed",
          generatedAt: now,
          lastSeenAt: now,
          error: message,
        });

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: null,
          previewClipAssetPath: null,
          previewStatus: "failed",
          previewGeneratedAt: now,
          previewError: message,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: "failed",
        };
      }
    },

    async cleanupPreviewAssets(input?: { now?: Date; retentionDays?: number; activeFingerprints?: Array<{ site: Site; sourceFingerprint: string }> }) {
      const now = input?.now ?? new Date();
      const retentionDays = input?.retentionDays ?? getPopularPreviewRetentionDays();
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      const activeFingerprints = new Set(
        (input?.activeFingerprints ?? []).map((entry) => `${entry.site}:${entry.sourceFingerprint}`)
      );
      const staleEntries = await dependencies.repository.listPreviewAssetCachesOlderThan({ cutoff });
      const deletableEntries = staleEntries.filter(
        (entry) => !activeFingerprints.has(`${entry.site}:${entry.sourceFingerprint}`)
      );

      for (const entry of deletableEntries) {
        for (const relativePath of [entry.thumbnailAssetPath, entry.clipAssetPath]) {
          if (!relativePath) {
            continue;
          }

          await fs.rm(path.join(assetDir, relativePath), { force: true });
        }
      }

      if (deletableEntries.length > 0) {
        await dependencies.repository.deletePreviewAssetCaches({
          entries: deletableEntries.map((entry) => ({
            site: entry.site,
            sourceFingerprint: entry.sourceFingerprint,
          })),
        });
      }

      await appendAppLog({
        source: "preview",
        level: "info",
        message: "popular preview cleanup complete",
        details: {
          retentionDays,
          deletedEntries: deletableEntries.length,
        },
      });

      return {
        deletedEntries: deletableEntries.length,
      };
    },
  };
}

