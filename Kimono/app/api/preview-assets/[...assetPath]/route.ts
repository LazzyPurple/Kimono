import path from "node:path";
import { promises as fs, createReadStream } from "node:fs";

import { NextRequest, NextResponse } from "next/server";

import { resolvePreviewAssetDir } from "@/lib/popular-preview-assets";

export const dynamic = "force-dynamic";

const CONTENT_TYPES = new Map([
  [".webp", "image/webp"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".mp4", "video/mp4"],
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
  context: { params: Promise<{ assetPath?: string[] }> }
) {
  const { assetPath = [] } = await context.params;
  const relativePath = assetPath.join("/");

  if (!isSafeAssetPath(relativePath)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  const assetRoot = resolvePreviewAssetDir();
  const absolutePath = path.resolve(assetRoot, relativePath);
  if (!absolutePath.startsWith(path.resolve(assetRoot) + path.sep)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stat = await fs.stat(absolutePath);
    const totalSize = stat.size;
    const contentType = CONTENT_TYPES.get(path.extname(absolutePath).toLowerCase()) ?? "application/octet-stream";

    const range = parseRange(request.headers.get("range"), totalSize);

    if (range === false) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "content-range": `bytes */${totalSize}`,
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
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
          stream.on("error", (err) => controller.error(err));
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
        },
      });
    }

    // Full file — stream it instead of buffering in memory
    const stream = createReadStream(absolutePath);
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
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
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
