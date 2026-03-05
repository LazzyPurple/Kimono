import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { Readable } from "stream";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/* ── Config ─────────────────────────────────────────────────── */
const FFMPEG_CONCURRENCY_LIMIT = 5;
const FFMPEG_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
const CACHE_MAX_ENTRIES = 500;

const ALLOWED_HOSTS = [
  "kemono.cr",
  "coomer.st",
  "kemono.su",
  "coomer.su",
  "img.kemono.cr",
  "img.coomer.st",
  "img.kemono.su",
  "img.coomer.su",
];

function autoReferer(hostname: string): string {
  const base = hostname.replace(/^img\./, "");
  return `https://${base}/`;
}

/* ── In-memory cache ────────────────────────────────────────── */
const cache = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<Buffer | null>>();

/* ── Semaphore for ffmpeg concurrency ───────────────────────── */
let activeFFmpeg = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeFFmpeg < FFMPEG_CONCURRENCY_LIMIT) {
    activeFFmpeg++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waitQueue.push(resolve));
}

function releaseSlot() {
  activeFFmpeg--;
  const next = waitQueue.shift();
  if (next) {
    activeFFmpeg++;
    next();
  }
}

/* ── Core extraction ────────────────────────────────────────── */
async function extractFrame(videoUrl: string): Promise<Buffer | null> {
  // Check cache
  if (cache.has(videoUrl)) return cache.get(videoUrl)!;

  // Deduplicate concurrent requests
  if (inFlight.has(videoUrl)) return inFlight.get(videoUrl)!;

  const promise = _doExtract(videoUrl);
  inFlight.set(videoUrl, promise);

  try {
    return await promise;
  } finally {
    inFlight.delete(videoUrl);
  }
}

async function _doExtract(videoUrl: string): Promise<Buffer | null> {
  const parsedUrl = new URL(videoUrl);

  // 1. Download first 2 MB of the video
  let videoBuffer: Buffer;
  try {
    const resp = await axios.get(parsedUrl.toString(), {
      responseType: "arraybuffer",
      timeout: 10_000,
      headers: {
        Range: `bytes=0-${MAX_DOWNLOAD_BYTES}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: autoReferer(parsedUrl.hostname),
      },
      // Accept 200 (full) and 206 (partial)
      validateStatus: (s) => s === 200 || s === 206,
    });
    videoBuffer = Buffer.from(resp.data);
  } catch {
    return null;
  }

  // 2. Write to temp file (ffmpeg needs seekable input for frame extraction)
  const tmpFile = join(tmpdir(), `kimono-vt-${randomBytes(8).toString("hex")}.mp4`);
  const outFile = join(tmpdir(), `kimono-vt-${randomBytes(8).toString("hex")}.jpg`);

  try {
    await writeFile(tmpFile, videoBuffer);

    // 3. Acquire concurrency slot
    await acquireSlot();

    try {
      const buf = await new Promise<Buffer | null>((resolve) => {
        let resolved = false;

        const command = ffmpeg(tmpFile)
          .seekInput(3)
          .frames(1)
          .outputOptions(["-f", "image2", "-vcodec", "mjpeg", "-q:v", "5"])
          .output(outFile)
          .on("end", async () => {
            if (resolved) return;
            resolved = true;
            try {
              const { readFile } = await import("fs/promises");
              const data = await readFile(outFile);
              resolve(data);
            } catch {
              resolve(null);
            }
          })
          .on("error", () => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          });

        // Timeout: kill ffmpeg after FFMPEG_TIMEOUT_MS
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try { command.kill("SIGKILL"); } catch { /* noop */ }
            resolve(null);
          }
        }, FFMPEG_TIMEOUT_MS);

        command.on("end", () => clearTimeout(timer));
        command.on("error", () => clearTimeout(timer));

        command.run();
      });

      // Cache the result
      if (buf) {
        // LRU eviction if cache is full
        if (cache.size >= CACHE_MAX_ENTRIES) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(videoUrl, buf);
      }

      return buf;
    } finally {
      releaseSlot();
    }
  } finally {
    // Cleanup temp files
    await unlink(tmpFile).catch(() => {});
    await unlink(outFile).catch(() => {});
  }
}

/* ── Route handler ──────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Bad protocol");
    }
    if (!ALLOWED_HOSTS.some((h) => parsedUrl.hostname === h)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const frame = await extractFrame(rawUrl);

    if (!frame) {
      return NextResponse.json(
        { error: "Could not extract frame" },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(frame), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[video-thumbnail-proxy] Error:", msg);
    return NextResponse.json(
      { error: "Extraction failed", detail: msg },
      { status: 500 }
    );
  }
}
