import path from "node:path";
import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import { getPostVideoEntries, getPostVideoUrls, resolvePostMedia, type PostVideoSource, type UnifiedPost } from "./api/helpers.ts";
import { appendAppLog, logAppError } from "./app-logger.ts";
import type {
  MediaSourceCacheInput,
  MediaSourceCacheRecord,
  MediaSourcePriorityClass,
  PerformanceRepository,
  PreviewAssetCacheInput,
  PreviewAssetCacheRecord,
  Site,
} from "./db/index.ts";
import { getDefaultFfmpegSemaphore, type FfmpegSemaphore } from "./ffmpeg-semaphore.ts";

const DEFAULT_PREVIEW_ASSET_DIR = path.join(process.cwd(), "tmp", "preview-assets");
const DEFAULT_MEDIA_SOURCE_CACHE_DIR = path.join(process.cwd(), "tmp", "media-source-cache");
const DEFAULT_PREVIEW_RETENTION_DAYS = 7;
const DEFAULT_PREVIEW_CLIP_SECONDS = 3;
const DEFAULT_POPULAR_SOURCE_RETENTION_HOURS = 72;
const DEFAULT_LIKED_SOURCE_RETENTION_HOURS = 336;
const DEFAULT_PLAYBACK_SOURCE_RETENTION_HOURS = 24;
const DEFAULT_MEDIA_SOURCE_MAX_FILE_SIZE_MB = 2048;
const DEFAULT_MEDIA_SOURCE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MEDIA_SOURCE_DOWNLOAD_CONCURRENCY = 2;
const PREVIEW_NO_FFMPEG_RETRY_MS = 6 * 60 * 60 * 1000;
const PREVIEW_FAILURE_RETRY_MS = 30 * 60 * 1000;
const DURATION_PATTERN = /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/i;

const previewRuntimeState = globalThis as typeof globalThis & {
  __kimonoPreviewToolWarnings?: Set<string>;
  __kimonoMediaSourceDownloadSemaphore?: FfmpegSemaphore & { limit: number };
  __kimonoMediaSourceWarmups?: Map<string, Promise<void>>;
};

export type PreparedPopularPreviewOutcome = "not-video" | "reused" | "generated" | "skipped-no-ffmpeg" | "failed" | "missing";
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
  previewOutcome: PreparedPopularPreviewOutcome;
}

export interface VideoAnalysisResult {
  durationSeconds: number | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
}

interface GeneratedPreviewAssets {
  thumbnailAssetPath: string | null;
  clipAssetPath: string | null;
}

interface DownloadedMediaSource {
  localVideoPath: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  downloadedAt: Date;
}

interface DownloadMediaSourceInput {
  site: Site;
  sourceVideoUrl: string;
  sourceFingerprint: string;
  relativeSourcePath: string;
  absoluteSourcePath: string;
  timeoutMs: number;
  maxFileSizeBytes: number;
}

interface PopularPreviewAssetDependencies {
  repository: Pick<
    PerformanceRepository,
    | "getPreviewAssetCache"
    | "upsertPreviewAssetCache"
    | "touchPreviewAssetCache"
    | "listPreviewAssetCachesOlderThan"
    | "deletePreviewAssetCaches"
  > & Partial<Pick<
    PerformanceRepository,
    | "getMediaSourceCache"
    | "upsertMediaSourceCache"
    | "touchMediaSourceCache"
    | "listExpiredMediaSourceCaches"
    | "deleteMediaSourceCaches"
    | "getMediaSourceCacheStats"
    | "getPreviewAssetStats"
  >>;
  previewAssetDir?: string;
  mediaSourceCacheDir?: string;
  clipDurationSeconds?: number;
  semaphore?: FfmpegSemaphore;
  analyzeVideoSource?: (input: { site: Site; sourceVideoUrl: string }) => Promise<VideoAnalysisResult>;
  downloadMediaSource?: (input: DownloadMediaSourceInput) => Promise<DownloadedMediaSource>;
  generatePreviewAssets?: (input: {
    site: Site;
    sourceVideoUrl: string;
    sourceFingerprint: string;
    assetDir: string;
    paths: GeneratedPreviewAssets;
    durationSeconds: number | null;
    clipDurationSeconds: number;
    generateThumbnail: boolean;
    generateClip: boolean;
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

export function getPopularSourceRetentionHours(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.POPULAR_SOURCE_RETENTION_HOURS, DEFAULT_POPULAR_SOURCE_RETENTION_HOURS);
}

export function getLikedSourceRetentionHours(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.LIKED_SOURCE_RETENTION_HOURS, DEFAULT_LIKED_SOURCE_RETENTION_HOURS);
}

export function getPlaybackSourceRetentionHours(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.PLAYBACK_SOURCE_RETENTION_HOURS, DEFAULT_PLAYBACK_SOURCE_RETENTION_HOURS);
}

export function getMediaSourceMaxFileSizeBytes(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.MEDIA_SOURCE_MAX_FILE_SIZE_MB, DEFAULT_MEDIA_SOURCE_MAX_FILE_SIZE_MB) * 1024 * 1024;
}

export function getMediaSourceDownloadTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.MEDIA_SOURCE_DOWNLOAD_TIMEOUT_MS, DEFAULT_MEDIA_SOURCE_DOWNLOAD_TIMEOUT_MS);
}

export function getMediaSourceDownloadConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInteger(env.MEDIA_SOURCE_DOWNLOAD_CONCURRENCY, DEFAULT_MEDIA_SOURCE_DOWNLOAD_CONCURRENCY);
}

export function resolveMediaSourceCacheDir(env: NodeJS.ProcessEnv = process.env, workspaceRoot = process.cwd()): string {
  const configuredPath = env.MEDIA_SOURCE_CACHE_DIR?.trim();
  if (!configuredPath) {
    return path.resolve(workspaceRoot, DEFAULT_MEDIA_SOURCE_CACHE_DIR);
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(workspaceRoot, configuredPath);
}

function createSemaphore(limit: number): FfmpegSemaphore {
  let active = 0;
  const queue: Array<() => void> = [];

  return {
    acquire() {
      return new Promise((resolve) => {
        const claim = () => {
          active += 1;
          let released = false;
          resolve(() => {
            if (released) {
              return;
            }
            released = true;
            active = Math.max(0, active - 1);
            const next = queue.shift();
            if (next) {
              next();
            }
          });
        };

        if (active < limit) {
          claim();
          return;
        }

        queue.push(claim);
      });
    },

    get pending() {
      return queue.length;
    },

    get active() {
      return active;
    },
  };
}

function getDefaultMediaSourceDownloadSemaphore(env: NodeJS.ProcessEnv = process.env): FfmpegSemaphore {
  const limit = getMediaSourceDownloadConcurrency(env);
  if (previewRuntimeState.__kimonoMediaSourceDownloadSemaphore?.limit === limit) {
    return previewRuntimeState.__kimonoMediaSourceDownloadSemaphore;
  }

  const semaphore = Object.assign(createSemaphore(limit), { limit });
  previewRuntimeState.__kimonoMediaSourceDownloadSemaphore = semaphore;
  return semaphore;
}

function getMediaSourceRetentionUntil(priorityClass: MediaSourcePriorityClass | null | undefined, now: Date): Date {
  const retentionHours = priorityClass === "liked"
    ? getLikedSourceRetentionHours()
    : priorityClass === "playback"
      ? getPlaybackSourceRetentionHours()
      : getPopularSourceRetentionHours();
  return new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
}

function getSourceFileExtension(sourceVideoUrl: string, mimeType: string | null | undefined): string {
  try {
    const ext = path.extname(new URL(sourceVideoUrl).pathname).toLowerCase();
    if (ext) {
      return ext;
    }
  } catch {
    // Ignore malformed URLs and fall back to MIME type.
  }

  switch (mimeType) {
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "video/x-matroska":
      return ".mkv";
    default:
      return ".mp4";
  }
}

function getMediaSourceRelativePath(site: Site, sourceFingerprint: string, sourceVideoUrl: string, mimeType: string | null | undefined): string {
  return `${site}/${sourceFingerprint}/source${getSourceFileExtension(sourceVideoUrl, mimeType)}`;
}

class MediaSourceDownloadError extends Error {
  status: string;
  retryAfterMs?: number | null;

  constructor(status: string, message: string, retryAfterMs?: number | null) {
    super(message);
    this.name = "MediaSourceDownloadError";
    this.status = status;
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

function classifyRemoteDownloadStatus(statusCode: number): string {
  if (statusCode === 404 || statusCode === 410) {
    return "source-not-found";
  }
  if (statusCode === 429) {
    return "remote-rate-limited";
  }
  return "remote-http-error";
}

async function defaultDownloadMediaSource(input: DownloadMediaSourceInput): Promise<DownloadedMediaSource> {
  const absoluteTargetPath = path.resolve(input.absoluteSourcePath);
  const tempPath = `${absoluteTargetPath}.part`;
  await fs.mkdir(path.dirname(absoluteTargetPath), { recursive: true });

  const response = await fetch(input.sourceVideoUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(input.timeoutMs),
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      referer: input.site === "coomer" ? "https://coomer.st/" : "https://kemono.cr/",
      accept: "text/css",
    },
  });

  if (!response.ok || !response.body) {
    throw new MediaSourceDownloadError(
      classifyRemoteDownloadStatus(response.status),
      `Media source download failed with status ${response.status}`
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > input.maxFileSizeBytes) {
    throw new MediaSourceDownloadError("source-download-failed", `Media source exceeds size limit (${declaredLength} bytes)`);
  }

  let totalBytes = 0;
  const readable = Readable.fromWeb(response.body as any);
  readable.on("data", (chunk) => {
    totalBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    if (totalBytes > input.maxFileSizeBytes) {
      readable.destroy(new MediaSourceDownloadError("source-download-failed", `Media source exceeds size limit (${totalBytes} bytes)`));
    }
  });

  try {
    await pipeline(readable, createWriteStream(tempPath));
    await fs.rm(absoluteTargetPath, { force: true });
    await fs.rename(tempPath, absoluteTargetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  const stats = await fs.stat(absoluteTargetPath);
  return {
    localVideoPath: input.relativeSourcePath,
    fileSizeBytes: stats.size,
    mimeType: response.headers.get("content-type"),
    downloadedAt: new Date(),
  };
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

  return `/api/media/preview/${relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function buildMediaSourcePublicUrl(site: Site, sourceFingerprint: string): string {
  return `/api/media/${encodeURIComponent(site)}/${encodeURIComponent(sourceFingerprint)}`;
}

async function canAccessBinary(binaryPath: string | null | undefined): Promise<boolean> {
  if (!binaryPath) {
    return false;
  }

  if (binaryPath.includes("/") || binaryPath.includes("\\")) {
    try {
      await fs.access(binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await runProcess(binaryPath, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

function isBinaryMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return code === "ENOENT" || /ffmpeg unavailable/i.test(message) || /ffprobe unavailable/i.test(message) || /ENOENT/i.test(message);
}

function getPreviewRetryAfter(error: unknown, now: Date): Date {
  const retryMs = isBinaryMissingError(error) ? PREVIEW_NO_FFMPEG_RETRY_MS : PREVIEW_FAILURE_RETRY_MS;
  return new Date(now.getTime() + retryMs);
}

function hasActiveRetryAfter(record: PreviewAssetCacheRecord | null, now: Date): boolean {
  return Boolean(record?.retryAfter && record.retryAfter.getTime() > now.getTime());
}

function mapRetryStatusToOutcome(status: string | null | undefined): PreparedPopularPreviewOutcome {
  switch (status) {
    case "skipped-no-ffmpeg":
      return "skipped-no-ffmpeg";
    case "failed":
      return "failed";
    case "ready":
    case "thumbnail-ready":
      return "reused";
    default:
      return "missing";
  }
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
  const configuredPath = process.env.FFMPEG_PATH?.trim();
  if (configuredPath && await canAccessBinary(configuredPath)) {
    return configuredPath;
  }

  try {
    const module = await import("ffmpeg-static");
    const candidateModule = module as unknown as string | { default?: string };
    const candidate = typeof candidateModule === "string" ? candidateModule : candidateModule.default ?? null;
    if (typeof candidate === "string" && candidate.trim() && await canAccessBinary(candidate.trim())) {
      return candidate.trim();
    }
  } catch {
    // ignore and keep probing fallbacks
  }

  if (await canAccessBinary("ffmpeg")) {
    return "ffmpeg";
  }

  return null;
}

function resolveFfprobePath(ffmpegPath: string): string {
  if (ffmpegPath === "ffmpeg") {
    return "ffprobe";
  }

  const dir = path.dirname(ffmpegPath);
  const ext = path.extname(ffmpegPath);
  return path.join(dir, `ffprobe${ext}`);
}

function logPreviewToolIssueOnce(tool: "ffmpeg" | "ffprobe", details: Record<string, unknown>) {
  previewRuntimeState.__kimonoPreviewToolWarnings ??= new Set<string>();
  const key = tool;
  if (previewRuntimeState.__kimonoPreviewToolWarnings.has(key)) {
    return;
  }

  previewRuntimeState.__kimonoPreviewToolWarnings.add(key);
  void appendAppLog({
    source: "preview",
    level: "info",
    message: "preview generation disabled: tool missing",
    details: {
      tool,
      ...details,
    },
  });
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function guessVideoMimeType(sourceVideoUrl: string): string | null {
  const pathname = new URL(sourceVideoUrl).pathname.toLowerCase();
  if (pathname.endsWith(".webm")) {
    return "video/webm";
  }
  if (pathname.endsWith(".mov") || pathname.endsWith(".m4v") || pathname.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (pathname.endsWith(".avi")) {
    return "video/x-msvideo";
  }
  if (pathname.endsWith(".mkv")) {
    return "video/x-matroska";
  }
  return null;
}

function runProcess(binaryPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, { windowsHide: true });
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

      const error = new Error(`Process exited with code ${code}`);
      (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
      (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
      reject(error);
    });
  });
}

export async function analyzeVideoSourceLightweight(input: { site: Site; sourceVideoUrl: string }): Promise<VideoAnalysisResult> {
  const ffmpegPath = await resolveFfmpegPath();
  const fallbackMimeType = guessVideoMimeType(input.sourceVideoUrl);
  if (!ffmpegPath) {
    logPreviewToolIssueOnce("ffmpeg", { mode: "lightweight-probe", site: input.site });
    return {
      durationSeconds: null,
      width: null,
      height: null,
      mimeType: fallbackMimeType,
    };
  }

  const ffprobePath = resolveFfprobePath(ffmpegPath);
  const canUseFfprobe = await canAccessBinary(ffprobePath);
  if (!canUseFfprobe) {
    logPreviewToolIssueOnce("ffprobe", { mode: "lightweight-probe", site: input.site, ffprobePath });
  }
  if (canUseFfprobe) {
    try {
    const { stdout } = await runProcess(ffprobePath, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      input.sourceVideoUrl,
    ]);
    const parsed = JSON.parse(stdout);
    const videoStream = Array.isArray(parsed?.streams)
      ? parsed.streams.find((stream: { codec_type?: string }) => stream?.codec_type === "video")
      : null;

    return {
      durationSeconds: parsePositiveNumber(parsed?.format?.duration) ?? parsePositiveNumber(videoStream?.duration),
      width: parsePositiveNumber(videoStream?.width),
      height: parsePositiveNumber(videoStream?.height),
      mimeType: fallbackMimeType,
    };
    } catch {
      // ffprobe unavailable or failed, fall back to ffmpeg.
    }
  }

  try {
    const { stderr } = await runProcess(ffmpegPath, ["-i", input.sourceVideoUrl, "-f", "null", "-t", "0", "-"]);
    const match = stderr.match(DURATION_PATTERN);
    if (!match) {
      return {
        durationSeconds: null,
        width: null,
        height: null,
        mimeType: fallbackMimeType,
      };
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    return {
      durationSeconds: hours * 3600 + minutes * 60 + seconds,
      width: null,
      height: null,
      mimeType: fallbackMimeType,
    };
  } catch {
    return {
      durationSeconds: null,
      width: null,
      height: null,
      mimeType: fallbackMimeType,
    };
  }
}

async function defaultGeneratePreviewAssets(input: {
  sourceVideoUrl: string;
  sourceFingerprint: string;
  assetDir: string;
  paths: GeneratedPreviewAssets;
  durationSeconds: number | null;
  clipDurationSeconds: number;
  generateThumbnail: boolean;
  generateClip: boolean;
}): Promise<GeneratedPreviewAssets> {
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new Error("FFmpeg is unavailable");
  }

  const thumbAbsolutePath = path.join(input.assetDir, input.paths.thumbnailAssetPath ?? "");
  const clipAbsolutePath = path.join(input.assetDir, input.paths.clipAssetPath ?? "");

  if (input.generateThumbnail) {
    await fs.mkdir(path.dirname(thumbAbsolutePath), { recursive: true });
  }

  if (input.generateClip) {
    await fs.mkdir(path.dirname(clipAbsolutePath), { recursive: true });
  }

  const duration = input.durationSeconds ?? 0;
  const thumbOffsetSeconds = duration > 6 ? Math.min(3, Math.max(1, Math.floor(duration * 0.15))) : 1;
  const clipOffsetSeconds = duration > input.clipDurationSeconds + 2
    ? Math.max(1, Math.floor(duration * 0.2))
    : 0;

  if (input.generateThumbnail) {
    await runProcess(ffmpegPath, [
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
  }

  if (input.generateClip) {
    await runProcess(ffmpegPath, [
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
  }

  return {
    thumbnailAssetPath: input.generateThumbnail ? input.paths.thumbnailAssetPath : null,
    clipAssetPath: input.generateClip ? input.paths.clipAssetPath : null,
  };
}

function chooseLongestVideoCandidate<T extends { url: string; durationSeconds: number | null; fingerprint: string; existing: PreviewAssetCacheRecord | null }>(candidates: T[]): T | null {
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

function hasVideoAnalysisMetadata(analysis: VideoAnalysisResult | null | undefined): boolean {
  if (!analysis) {
    return false;
  }

  return analysis.durationSeconds != null
    || analysis.width != null
    || analysis.height != null
    || typeof analysis.mimeType === "string";
}

function shouldPersistAnalyzedMetadata(
  existing: PreviewAssetCacheRecord | null,
  analysis: VideoAnalysisResult
): boolean {
  if (!hasVideoAnalysisMetadata(analysis)) {
    return false;
  }

  if (!existing) {
    return true;
  }

  return existing.durationSeconds !== (analysis.durationSeconds ?? null)
    || existing.width !== (analysis.width ?? null)
    || existing.height !== (analysis.height ?? null)
    || existing.mimeType !== (analysis.mimeType ?? null)
    || existing.mediaKind !== "video"
    || existing.probeStatus !== "probed";
}

function deriveArtifactStatus(status: string): string {
  switch (status) {
    case "ready":
      return "ready";
    case "thumbnail-ready":
      return "partial";
    case "failed":
      return "failed";
    case "pending":
      return "pending";
    default:
      return "missing";
  }
}

function buildPreviewAssetRecord(input: {
  site: Site;
  sourceVideoUrl: string;
  sourceFingerprint: string;
  now: Date;
  existing: PreviewAssetCacheRecord | null;
  generatedAt?: Date | null;
  status: string;
  error: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  thumbnailAssetPath: string | null;
  clipAssetPath: string | null;
  nativeThumbnailUrl?: string | null;
  lastObservedContext?: string | null;
  generationAttempts?: number | null;
  retryAfter?: Date | null;
}): PreviewAssetCacheInput {
  const analysis: VideoAnalysisResult = {
    durationSeconds: input.durationSeconds,
    width: input.width,
    height: input.height,
    mimeType: input.mimeType,
  };

  return {
    site: input.site,
    sourceVideoUrl: input.sourceVideoUrl,
    sourceFingerprint: input.sourceFingerprint,
    durationSeconds: input.durationSeconds,
    thumbnailAssetPath: input.thumbnailAssetPath,
    clipAssetPath: input.clipAssetPath,
    status: input.status,
    generatedAt: input.generatedAt ?? (input.status === input.existing?.status ? input.existing?.generatedAt ?? input.now : input.now),
    lastSeenAt: input.now,
    error: input.error,
    mediaKind: input.existing?.mediaKind ?? "video",
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    nativeThumbnailUrl: input.nativeThumbnailUrl ?? input.existing?.nativeThumbnailUrl ?? null,
    probeStatus: hasVideoAnalysisMetadata(analysis) ? "probed" : input.existing?.probeStatus ?? null,
    artifactStatus: deriveArtifactStatus(input.status),
    firstSeenAt: input.existing?.firstSeenAt ?? input.now,
    hotUntil: input.existing?.hotUntil ?? null,
    retryAfter: input.retryAfter ?? input.existing?.retryAfter ?? null,
    generationAttempts: input.generationAttempts ?? input.existing?.generationAttempts ?? 0,
    lastError: input.error ?? null,
    lastObservedContext: input.lastObservedContext ?? input.existing?.lastObservedContext ?? "popular",
  };
}

export function createPopularPreviewAssetService(dependencies: PopularPreviewAssetDependencies) {
  const assetDir = dependencies.previewAssetDir ?? resolvePreviewAssetDir();
  const mediaSourceCacheDir = dependencies.mediaSourceCacheDir ?? resolveMediaSourceCacheDir();
  const analyzeVideoSource = dependencies.analyzeVideoSource ?? analyzeVideoSourceLightweight;
  const downloadMediaSource = dependencies.downloadMediaSource ?? defaultDownloadMediaSource;
  const generatePreviewAssets = dependencies.generatePreviewAssets ?? defaultGeneratePreviewAssets;
  const fileExists = dependencies.fileExists ?? defaultFileExists;
  const clipDurationSeconds = dependencies.clipDurationSeconds ?? getPopularPreviewClipSeconds();
  const semaphore = dependencies.semaphore ?? getDefaultFfmpegSemaphore();
  const downloadSemaphore = getDefaultMediaSourceDownloadSemaphore();

  const getMediaSourceCache = async (site: Site, sourceFingerprint: string) =>
    dependencies.repository.getMediaSourceCache?.({ site, sourceFingerprint }) ?? null;
  const upsertMediaSourceCache = async (input: MediaSourceCacheInput) => {
    await dependencies.repository.upsertMediaSourceCache?.(input);
  };
  const touchMediaSourceCache = async (input: {
    site: Site;
    sourceFingerprint: string;
    lastSeenAt: Date;
    retentionUntil?: Date | null;
    priorityClass?: MediaSourcePriorityClass | null;
  }) => {
    await dependencies.repository.touchMediaSourceCache?.(input);
  };

  function isPremiumPriority(priorityClass: MediaSourcePriorityClass | null | undefined): boolean {
    return priorityClass === 'liked' || priorityClass === 'playback';
  }

  async function ensureLocalSourceForCandidate(input: {
    site: Site;
    now: Date;
    candidate: {
      url: string;
      fingerprint: string;
      durationSeconds: number | null;
      width: number | null;
      height: number | null;
      mimeType: string | null;
      existing: PreviewAssetCacheRecord | null;
    };
    priorityClass: MediaSourcePriorityClass | null | undefined;
  }): Promise<{
    sourceRecord: MediaSourceCacheRecord | null;
    sourceVideoUrl: string;
  }> {
    const existingSource = await getMediaSourceCache(input.site, input.candidate.fingerprint);
    const hasLocalSource = Boolean(
      existingSource?.localVideoPath
      && await fileExists(existingSource.localVideoPath, mediaSourceCacheDir)
    );
    const retentionUntil = isPremiumPriority(input.priorityClass)
      ? getMediaSourceRetentionUntil(input.priorityClass, input.now)
      : existingSource?.retentionUntil ?? null;

    if (hasLocalSource && existingSource?.localVideoPath) {
      await touchMediaSourceCache({
        site: input.site,
        sourceFingerprint: input.candidate.fingerprint,
        lastSeenAt: input.now,
        retentionUntil,
        priorityClass: input.priorityClass ?? existingSource.priorityClass ?? null,
      });
      return {
        sourceRecord: {
          ...existingSource,
          lastSeenAt: input.now,
          retentionUntil,
          priorityClass: input.priorityClass ?? existingSource.priorityClass ?? null,
        },
        sourceVideoUrl: path.join(mediaSourceCacheDir, existingSource.localVideoPath),
      };
    }

    if (!isPremiumPriority(input.priorityClass)) {
      return {
        sourceRecord: existingSource,
        sourceVideoUrl: input.candidate.url,
      };
    }

    if (existingSource?.retryAfter && existingSource.retryAfter.getTime() > input.now.getTime()) {
      return {
        sourceRecord: existingSource,
        sourceVideoUrl: input.candidate.url,
      };
    }

    const relativeSourcePath = getMediaSourceRelativePath(
      input.site,
      input.candidate.fingerprint,
      input.candidate.url,
      input.candidate.mimeType
    );
    const absoluteSourcePath = path.join(mediaSourceCacheDir, relativeSourcePath);

    await upsertMediaSourceCache({
      site: input.site,
      sourceVideoUrl: input.candidate.url,
      sourceFingerprint: input.candidate.fingerprint,
      localVideoPath: existingSource?.localVideoPath ?? relativeSourcePath,
      downloadStatus: 'source-downloading',
      downloadedAt: existingSource?.downloadedAt ?? null,
      lastSeenAt: input.now,
      retentionUntil,
      fileSizeBytes: existingSource?.fileSizeBytes ?? null,
      mimeType: input.candidate.mimeType ?? existingSource?.mimeType ?? null,
      downloadError: null,
      downloadAttempts: (existingSource?.downloadAttempts ?? 0) + 1,
      lastObservedContext: input.priorityClass ?? 'regular',
      priorityClass: input.priorityClass ?? existingSource?.priorityClass ?? null,
      retryAfter: null,
      firstSeenAt: existingSource?.firstSeenAt ?? input.now,
    });

    try {
      const releaseDownloadSlot = await downloadSemaphore.acquire();
      let downloaded: DownloadedMediaSource;
      try {
        downloaded = await downloadMediaSource({
          site: input.site,
          sourceVideoUrl: input.candidate.url,
          sourceFingerprint: input.candidate.fingerprint,
          relativeSourcePath,
          absoluteSourcePath,
          timeoutMs: getMediaSourceDownloadTimeoutMs(),
          maxFileSizeBytes: getMediaSourceMaxFileSizeBytes(),
        });
      } finally {
        releaseDownloadSlot();
      }

      const sourceRecord: MediaSourceCacheRecord = {
        site: input.site,
        sourceVideoUrl: input.candidate.url,
        sourceFingerprint: input.candidate.fingerprint,
        localVideoPath: downloaded.localVideoPath,
        downloadStatus: 'source-ready',
        downloadedAt: downloaded.downloadedAt,
        lastSeenAt: input.now,
        retentionUntil,
        fileSizeBytes: downloaded.fileSizeBytes,
        mimeType: downloaded.mimeType ?? input.candidate.mimeType ?? null,
        downloadError: null,
        downloadAttempts: (existingSource?.downloadAttempts ?? 0) + 1,
        lastObservedContext: input.priorityClass ?? 'regular',
        priorityClass: input.priorityClass ?? null,
        retryAfter: null,
        firstSeenAt: existingSource?.firstSeenAt ?? input.now,
      };
      await upsertMediaSourceCache(sourceRecord);

      await appendAppLog({
        source: 'preview',
        level: 'info',
        message: 'source download completed',
        details: {
          site: input.site,
          sourceFingerprint: input.candidate.fingerprint,
          priorityClass: input.priorityClass ?? 'regular',
          localVideoPath: downloaded.localVideoPath,
          fileSizeBytes: downloaded.fileSizeBytes,
        },
      });

      return {
        sourceRecord,
        sourceVideoUrl: path.join(mediaSourceCacheDir, downloaded.localVideoPath),
      };
    } catch (error) {
      const status = error instanceof MediaSourceDownloadError ? error.status : 'source-download-failed';
      const retryAfter = new Date(input.now.getTime() + (status === 'remote-rate-limited' ? PREVIEW_NO_FFMPEG_RETRY_MS : PREVIEW_FAILURE_RETRY_MS));
      const message = error instanceof Error ? error.message : String(error);

      await fs.rm(`${absoluteSourcePath}.part`, { force: true }).catch(() => undefined);
      await upsertMediaSourceCache({
        site: input.site,
        sourceVideoUrl: input.candidate.url,
        sourceFingerprint: input.candidate.fingerprint,
        localVideoPath: existingSource?.localVideoPath ?? null,
        downloadStatus: status,
        downloadedAt: existingSource?.downloadedAt ?? null,
        lastSeenAt: input.now,
        retentionUntil,
        fileSizeBytes: existingSource?.fileSizeBytes ?? null,
        mimeType: input.candidate.mimeType ?? existingSource?.mimeType ?? null,
        downloadError: message,
        downloadAttempts: (existingSource?.downloadAttempts ?? 0) + 1,
        lastObservedContext: input.priorityClass ?? 'regular',
        priorityClass: input.priorityClass ?? existingSource?.priorityClass ?? null,
        retryAfter,
        firstSeenAt: existingSource?.firstSeenAt ?? input.now,
      });

      await logAppError('preview', 'source download failed', error, {
        details: {
          site: input.site,
          sourceFingerprint: input.candidate.fingerprint,
          priorityClass: input.priorityClass ?? 'regular',
          sourceVideoUrl: input.candidate.url,
        },
      });

      return {
        sourceRecord: existingSource,
        sourceVideoUrl: input.candidate.url,
      };
    }
  }

  return {
    async warmSourceForPostVideo(input: { site: Site; post: UnifiedPost; videoPath: string; now?: Date; priorityClass?: MediaSourcePriorityClass | null }): Promise<PostVideoSource | null> {
      const now = input.now ?? new Date();
      const priorityClass = input.priorityClass ?? 'playback';
      const match = getPostVideoEntries(input.post).find((entry) => entry.path === input.videoPath);
      if (!match) {
        return null;
      }

      const sourceFingerprint = createPreviewSourceFingerprint(input.site, match.url);
      const warmupKey = `${input.site}:${sourceFingerprint}`;
      previewRuntimeState.__kimonoMediaSourceWarmups ??= new Map();

      const existingSource = await getMediaSourceCache(input.site, sourceFingerprint);
      const hasReadyLocalSource = Boolean(
        existingSource?.localVideoPath
        && existingSource.downloadStatus === 'source-ready'
        && await fileExists(existingSource.localVideoPath, mediaSourceCacheDir)
      );
      const hasWarmupInFlight = previewRuntimeState.__kimonoMediaSourceWarmups.has(warmupKey);

      if (!hasReadyLocalSource && !hasWarmupInFlight && !(existingSource?.retryAfter && existingSource.retryAfter.getTime() > now.getTime())) {
        const warmupPromise = (async () => {
          try {
            await ensureLocalSourceForCandidate({
              site: input.site,
              now,
              candidate: {
                url: match.url,
                fingerprint: sourceFingerprint,
                durationSeconds: null,
                width: null,
                height: null,
                mimeType: null,
                existing: null,
              },
              priorityClass,
            });
          } catch (error) {
            await logAppError('preview', 'playback source warmup failed', error, {
              details: {
                site: input.site,
                sourceFingerprint,
                videoPath: input.videoPath,
                priorityClass,
              },
            });
          } finally {
            previewRuntimeState.__kimonoMediaSourceWarmups?.delete(warmupKey);
          }
        })();
        previewRuntimeState.__kimonoMediaSourceWarmups.set(warmupKey, warmupPromise);
      }

      const refreshedSource = await getMediaSourceCache(input.site, sourceFingerprint);
      const localSourceAvailable = input.site === 'coomer'
        && Boolean(refreshedSource?.localVideoPath)
        && refreshedSource?.downloadStatus === 'source-ready';

      return {
        path: match.path,
        sourceFingerprint,
        upstreamUrl: match.url,
        localSourceAvailable,
        sourceCacheStatus: refreshedSource?.downloadStatus ?? (previewRuntimeState.__kimonoMediaSourceWarmups.has(warmupKey) ? 'source-downloading' : null),
        localStreamUrl: localSourceAvailable
          ? buildMediaSourcePublicUrl(input.site, sourceFingerprint)
          : null,
      };
    },

    async preparePreviewForPost(input: { site: Site; post: UnifiedPost; now?: Date; generationStrategy?: PreviewGenerationStrategy; priorityClass?: MediaSourcePriorityClass }): Promise<PreparedPopularPreview> {
      const now = input.now ?? new Date();
      const priorityClass = input.priorityClass ?? 'regular';
      const videoUrls = Array.from(new Set(getPostVideoUrls(input.post)));
      if (videoUrls.length === 0) {
        return {
          longestVideoUrl: null,
          longestVideoDurationSeconds: null,
          previewThumbnailAssetPath: null,
          previewClipAssetPath: null,
          previewStatus: 'not-video',
          previewGeneratedAt: null,
          previewError: null,
          previewSourceFingerprint: null,
          previewOutcome: 'not-video',
        };
      }

      const candidates = [] as Array<{
        url: string;
        durationSeconds: number | null;
        width: number | null;
        height: number | null;
        mimeType: string | null;
        fingerprint: string;
        existing: PreviewAssetCacheRecord | null;
        shouldPersistMetadataOnly: boolean;
      }>;
      for (const url of videoUrls) {
        const fingerprint = createPreviewSourceFingerprint(input.site, url);
        const existing = await dependencies.repository.getPreviewAssetCache({
          site: input.site,
          sourceFingerprint: fingerprint,
        });

        let durationSeconds = existing?.durationSeconds ?? null;
        let width = existing?.width ?? null;
        let height = existing?.height ?? null;
        let mimeType = existing?.mimeType ?? null;
        let shouldPersistMetadataOnly = false;

        const shouldAnalyze = durationSeconds == null || (
          existing?.status !== 'ready'
          && existing?.status !== 'thumbnail-ready'
          && (width == null || height == null || mimeType == null)
        );

        if (shouldAnalyze) {
          const analysis = await analyzeVideoSource({ site: input.site, sourceVideoUrl: url });
          durationSeconds = durationSeconds ?? analysis.durationSeconds ?? null;
          width = width ?? analysis.width ?? null;
          height = height ?? analysis.height ?? null;
          mimeType = mimeType ?? analysis.mimeType ?? null;
          shouldPersistMetadataOnly = shouldPersistAnalyzedMetadata(existing, {
            durationSeconds,
            width,
            height,
            mimeType,
          });
        }

        candidates.push({
          url,
          durationSeconds,
          width,
          height,
          mimeType,
          fingerprint,
          existing,
          shouldPersistMetadataOnly,
        });
      }

      const chosenCandidate = chooseLongestVideoCandidate(candidates);
      if (!chosenCandidate) {
        return {
          longestVideoUrl: videoUrls[0] ?? null,
          longestVideoDurationSeconds: null,
          previewThumbnailAssetPath: null,
          previewClipAssetPath: null,
          previewStatus: 'missing',
          previewGeneratedAt: null,
          previewError: null,
          previewSourceFingerprint: null,
          previewOutcome: 'missing',
        };
      }

      await Promise.all(
        candidates
          .filter((candidate) => candidate.shouldPersistMetadataOnly && candidate.fingerprint !== chosenCandidate.fingerprint)
          .map((candidate) =>
            dependencies.repository.upsertPreviewAssetCache(
              buildPreviewAssetRecord({
                site: input.site,
                sourceVideoUrl: candidate.url,
                sourceFingerprint: candidate.fingerprint,
                now,
                existing: candidate.existing,
                status: candidate.existing?.status ?? 'metadata-only',
                error: candidate.existing?.error ?? null,
                durationSeconds: candidate.durationSeconds,
                width: candidate.width,
                height: candidate.height,
                mimeType: candidate.mimeType,
                thumbnailAssetPath: candidate.existing?.thumbnailAssetPath ?? null,
                clipAssetPath: candidate.existing?.clipAssetPath ?? null,
              })
            )
          )
      );

      const previewPaths = getPreviewAssetRelativePaths(input.site, chosenCandidate.fingerprint);
      const existingRecord = chosenCandidate.existing;
      const nativePreviewImageUrl = input.site === 'coomer' ? resolvePostMedia(input.post).previewImageUrl : undefined;
      const localSource = await ensureLocalSourceForCandidate({
        site: input.site,
        now,
        candidate: chosenCandidate,
        priorityClass,
      });
      const existingThumbnailAssetPath = existingRecord?.thumbnailAssetPath ?? null;
      const existingClipAssetPath = existingRecord?.clipAssetPath ?? null;
      const canReuseThumbnail = existingThumbnailAssetPath != null
        && await fileExists(existingThumbnailAssetPath, assetDir);
      const canReuseClip = existingClipAssetPath != null
        && await fileExists(existingClipAssetPath, assetDir);
      const wantsThumbnailFirst = input.site === 'coomer'
        && input.generationStrategy === 'thumbnail-first'
        && !nativePreviewImageUrl;
      const hasReusableReadyAssets = existingRecord?.status === 'ready'
        && canReuseClip
        && (canReuseThumbnail || Boolean(nativePreviewImageUrl));
      const shouldRefreshChosenMetadata = chosenCandidate.shouldPersistMetadataOnly;

      if (existingRecord?.retryAfter && existingRecord.retryAfter.getTime() > now.getTime() && !canReuseThumbnail && !canReuseClip) {
        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: existingThumbnailAssetPath,
          previewClipAssetPath: existingClipAssetPath,
          previewStatus: existingRecord?.status ?? 'pending',
          previewGeneratedAt: existingRecord?.generatedAt ?? now,
          previewError: existingRecord?.lastError ?? existingRecord?.error ?? null,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: mapRetryStatusToOutcome(existingRecord?.status),
        };
      }

      if (hasReusableReadyAssets) {
        if (shouldRefreshChosenMetadata) {
          await dependencies.repository.upsertPreviewAssetCache(
            buildPreviewAssetRecord({
              site: input.site,
              sourceVideoUrl: chosenCandidate.url,
              sourceFingerprint: chosenCandidate.fingerprint,
              now,
              existing: existingRecord,
              status: existingRecord?.status ?? 'ready',
              error: existingRecord?.error ?? null,
              durationSeconds: chosenCandidate.durationSeconds,
              width: chosenCandidate.width,
              height: chosenCandidate.height,
              mimeType: chosenCandidate.mimeType,
              thumbnailAssetPath: existingThumbnailAssetPath,
              clipAssetPath: existingClipAssetPath,
              nativeThumbnailUrl: nativePreviewImageUrl ?? existingRecord?.nativeThumbnailUrl ?? null,
            })
          );
        } else {
          await dependencies.repository.touchPreviewAssetCache({
            site: input.site,
            sourceFingerprint: chosenCandidate.fingerprint,
            lastSeenAt: now,
          });
        }

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: existingThumbnailAssetPath,
          previewClipAssetPath: existingClipAssetPath,
          previewStatus: 'ready',
          previewGeneratedAt: existingRecord?.generatedAt ?? now,
          previewError: null,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: 'reused',
        };
      }

      const hasReusableThumbnailOnly = existingRecord?.status === 'thumbnail-ready' && canReuseThumbnail;
      if (hasReusableThumbnailOnly) {
        if (shouldRefreshChosenMetadata) {
          await dependencies.repository.upsertPreviewAssetCache(
            buildPreviewAssetRecord({
              site: input.site,
              sourceVideoUrl: chosenCandidate.url,
              sourceFingerprint: chosenCandidate.fingerprint,
              now,
              existing: existingRecord,
              status: existingRecord?.status ?? 'thumbnail-ready',
              error: existingRecord?.error ?? null,
              durationSeconds: chosenCandidate.durationSeconds,
              width: chosenCandidate.width,
              height: chosenCandidate.height,
              mimeType: chosenCandidate.mimeType,
              thumbnailAssetPath: existingThumbnailAssetPath,
              clipAssetPath: null,
              nativeThumbnailUrl: nativePreviewImageUrl ?? existingRecord?.nativeThumbnailUrl ?? null,
            })
          );
        } else {
          await dependencies.repository.touchPreviewAssetCache({
            site: input.site,
            sourceFingerprint: chosenCandidate.fingerprint,
            lastSeenAt: now,
          });
        }

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: existingThumbnailAssetPath,
          previewClipAssetPath: null,
          previewStatus: 'thumbnail-ready',
          previewGeneratedAt: existingRecord?.generatedAt ?? now,
          previewError: null,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: 'reused',
        };
      }

      const ffmpegPath = await resolveFfmpegPath();
      if (!ffmpegPath) {
        await dependencies.repository.upsertPreviewAssetCache(
          buildPreviewAssetRecord({
            site: input.site,
            sourceVideoUrl: chosenCandidate.url,
            sourceFingerprint: chosenCandidate.fingerprint,
            now,
            existing: existingRecord,
            status: 'skipped-no-ffmpeg',
            error: 'FFmpeg unavailable',
            durationSeconds: chosenCandidate.durationSeconds,
            width: chosenCandidate.width,
            height: chosenCandidate.height,
            mimeType: chosenCandidate.mimeType,
            thumbnailAssetPath: existingThumbnailAssetPath,
            clipAssetPath: existingClipAssetPath,
            nativeThumbnailUrl: nativePreviewImageUrl ?? existingRecord?.nativeThumbnailUrl ?? null,
            retryAfter: new Date(now.getTime() + PREVIEW_NO_FFMPEG_RETRY_MS),
          })
        );

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: existingThumbnailAssetPath,
          previewClipAssetPath: existingClipAssetPath,
          previewStatus: 'skipped-no-ffmpeg',
          previewGeneratedAt: now,
          previewError: 'FFmpeg unavailable',
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: 'skipped-no-ffmpeg',
        };
      }

      try {
        const shouldGenerateThumbnail = !canReuseThumbnail && !nativePreviewImageUrl;
        const shouldGenerateClip = !wantsThumbnailFirst && !canReuseClip;

        const releaseSlot = await semaphore.acquire();
        let generatedAssets: GeneratedPreviewAssets;
        try {
          generatedAssets = await generatePreviewAssets({
            site: input.site,
            sourceVideoUrl: localSource.sourceVideoUrl,
            sourceFingerprint: chosenCandidate.fingerprint,
            assetDir,
            paths: previewPaths,
            durationSeconds: chosenCandidate.durationSeconds,
            clipDurationSeconds,
            generateThumbnail: shouldGenerateThumbnail,
            generateClip: shouldGenerateClip,
          });
        } finally {
          releaseSlot();
        }

        const record = buildPreviewAssetRecord({
          site: input.site,
          sourceVideoUrl: chosenCandidate.url,
          sourceFingerprint: chosenCandidate.fingerprint,
          now,
          existing: existingRecord,
          status: wantsThumbnailFirst ? 'thumbnail-ready' : 'ready',
          error: null,
          durationSeconds: chosenCandidate.durationSeconds,
          width: chosenCandidate.width,
          height: chosenCandidate.height,
          mimeType: chosenCandidate.mimeType ?? localSource.sourceRecord?.mimeType ?? null,
          thumbnailAssetPath: canReuseThumbnail
            ? existingThumbnailAssetPath
            : generatedAssets.thumbnailAssetPath,
          clipAssetPath: canReuseClip
            ? existingClipAssetPath
            : generatedAssets.clipAssetPath,
          nativeThumbnailUrl: nativePreviewImageUrl ?? existingRecord?.nativeThumbnailUrl ?? null,
          lastObservedContext: priorityClass,
        });
        await dependencies.repository.upsertPreviewAssetCache(record);

        await appendAppLog({
          source: 'preview',
          level: 'info',
          message: 'preview generated from local source',
          details: {
            site: input.site,
            sourceFingerprint: chosenCandidate.fingerprint,
            priorityClass,
            localSourceAvailable: Boolean(localSource.sourceRecord?.localVideoPath),
          },
        });

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: record.thumbnailAssetPath ?? null,
          previewClipAssetPath: record.clipAssetPath ?? null,
          previewStatus: record.status,
          previewGeneratedAt: now,
          previewError: null,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: 'generated',
        };
      } catch (error) {
        await logAppError('preview', 'popular preview generation failed', error, {
          details: {
            site: input.site,
            sourceFingerprint: chosenCandidate.fingerprint,
            sourceVideoUrl: chosenCandidate.url,
            priorityClass,
          },
        });
        const message = error instanceof Error ? error.message : String(error);
        const retryAfter = getPreviewRetryAfter(error, now);
        await dependencies.repository.upsertPreviewAssetCache(
          buildPreviewAssetRecord({
            site: input.site,
            sourceVideoUrl: chosenCandidate.url,
            sourceFingerprint: chosenCandidate.fingerprint,
            now,
            existing: existingRecord,
            status: 'failed',
            error: message,
            durationSeconds: chosenCandidate.durationSeconds,
            width: chosenCandidate.width,
            height: chosenCandidate.height,
            mimeType: chosenCandidate.mimeType ?? localSource.sourceRecord?.mimeType ?? null,
            thumbnailAssetPath: canReuseThumbnail ? existingThumbnailAssetPath : null,
            clipAssetPath: canReuseClip ? existingClipAssetPath : null,
            nativeThumbnailUrl: nativePreviewImageUrl ?? existingRecord?.nativeThumbnailUrl ?? null,
            generationAttempts: (existingRecord?.generationAttempts ?? 0) + 1,
            retryAfter,
            lastObservedContext: priorityClass,
          })
        );

        return {
          longestVideoUrl: chosenCandidate.url,
          longestVideoDurationSeconds: chosenCandidate.durationSeconds,
          previewThumbnailAssetPath: canReuseThumbnail ? existingThumbnailAssetPath : null,
          previewClipAssetPath: canReuseClip ? existingClipAssetPath : null,
          previewStatus: 'failed',
          previewGeneratedAt: now,
          previewError: message,
          previewSourceFingerprint: chosenCandidate.fingerprint,
          previewOutcome: 'failed',
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

      let deletedSources = 0;
      if (dependencies.repository.listExpiredMediaSourceCaches && dependencies.repository.deleteMediaSourceCaches) {
        const expiredSources = await dependencies.repository.listExpiredMediaSourceCaches({ cutoff: now });
        const deletableSources = expiredSources.filter(
          (entry) => !activeFingerprints.has(`${entry.site}:${entry.sourceFingerprint}`)
        );

        for (const entry of deletableSources) {
          if (entry.localVideoPath) {
            await fs.rm(path.join(mediaSourceCacheDir, entry.localVideoPath), { force: true }).catch(() => undefined);
          }
        }

        if (deletableSources.length > 0) {
          await dependencies.repository.deleteMediaSourceCaches({
            entries: deletableSources.map((entry) => ({
              site: entry.site,
              sourceFingerprint: entry.sourceFingerprint,
            })),
          });
        }
        deletedSources = deletableSources.length;
      }

      await appendAppLog({
        source: 'preview',
        level: 'info',
        message: 'popular preview cleanup complete',
        details: {
          retentionDays,
          deletedEntries: deletableEntries.length,
          deletedSources,
        },
      });

      return {
        deletedEntries: deletableEntries.length,
      };
    },
  };
}






