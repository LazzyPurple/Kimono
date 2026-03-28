import path from "node:path";
import { promises as fs, createReadStream } from "node:fs";

import { NextRequest, NextResponse } from "next/server";

import { getPerformanceRepository } from "@/lib/db/index";
import { resolveMediaSourceCacheDir } from "@/lib/popular-preview-assets";

export const dynamic = "force-dynamic";

const CONTENT_TYPES = new Map([
  [".webm", "video/webm"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".mkv", "video/x-matroska"],
  [".avi", "video/x-msvideo"],
]);

function isSafeAssetPath(assetPath: string): boolean {
  return assetPath.length > 0
    && !assetPath.includes("..")
    && !path.isAbsolute(assetPath)
    && assetPath.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function parseRange(rangeHeader: string | null, totalSize: number): { start: number; end: number } | null | false {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) {
    return false;
  }

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

  if (start >= totalSize || end >= totalSize || start > end) {
    return false;
  }

  return { start, end };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ site?: string; fp?: string }> }
) {
  const { site, fp } = await context.params;
  if (!site || (site !== "kemono" && site !== "coomer") || !fp) {
    return NextResponse.json({ error: "Invalid media source" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  const repository = await getPerformanceRepository();
  const sourceRecord = await repository.getMediaSourceCache({ site, sourceFingerprint: fp });
  if (!sourceRecord?.localVideoPath || sourceRecord.downloadStatus !== "source-ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-kimono-source": "stale" } });
  }

  if (!isSafeAssetPath(sourceRecord.localVideoPath)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-kimono-source": "stale" } });
  }

  const assetRoot = resolveMediaSourceCacheDir();
  const absolutePath = path.resolve(assetRoot, sourceRecord.localVideoPath);
  if (!absolutePath.startsWith(path.resolve(assetRoot) + path.sep)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const stat = await fs.stat(absolutePath);
    const totalSize = stat.size;
    const contentType = sourceRecord.mimeType ?? CONTENT_TYPES.get(path.extname(absolutePath).toLowerCase()) ?? "application/octet-stream";
    const range = parseRange(request.headers.get("range"), totalSize);

    if (range === false) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "content-range": `bytes */${totalSize}`,
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
          "x-kimono-source": "stale",
        },
      });
    }

    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const stream = createReadStream(absolutePath, { start, end });
      const readable = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
          stream.on("end", () => controller.close());
          stream.on("error", (error) => controller.error(error));
        },
        cancel() {
          stream.destroy();
        },
      });

      return new NextResponse(readable, {
        status: 206,
        headers: {
          "content-type": contentType,
          "content-length": String(chunkSize),
          "content-range": `bytes ${start}-${end}/${totalSize}`,
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
          "x-kimono-source": "db",
        },
      });
    }

    const stream = createReadStream(absolutePath);
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
        stream.on("end", () => controller.close());
        stream.on("error", (error) => controller.error(error));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(readable, {
      headers: {
        "content-type": contentType,
        "content-length": String(totalSize),
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
        "x-kimono-source": "db",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-kimono-source": "stale" } });
  }
}
