import path from "node:path";
import { promises as fs, createReadStream } from "node:fs";

import { NextRequest, NextResponse } from "next/server";

import { getPerformanceRepository } from "@/lib/db/index";
import { resolveMediaSourceCacheDir } from "@/lib/popular-preview-assets";
import { createHybridContentService } from "@/lib/hybrid-content";
import { resolveRequestedPostVideoSource } from "@/lib/post-video-sources";

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

function buildAttachmentDisposition(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function guessContentType(filename: string, fallback: string | null): string {
  return fallback ?? CONTENT_TYPES.get(path.extname(filename).toLowerCase()) ?? "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const site = searchParams.get("site");
  const service = searchParams.get("service");
  const creatorId = searchParams.get("creatorId");
  const postId = searchParams.get("postId");
  const mediaPath = searchParams.get("path");
  const sourceFingerprint = searchParams.get("sourceFingerprint");
  const filename = searchParams.get("filename") || (mediaPath ? path.basename(mediaPath) : "video");

  if (!site || (site !== "kemono" && site !== "coomer") || !service || !creatorId || !postId || !mediaPath) {
    return NextResponse.json({ error: "Invalid download request" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  const repository = await getPerformanceRepository();
  if (sourceFingerprint) {
    const sourceRecord = await repository.getMediaSourceCache({ site, sourceFingerprint });
    if (sourceRecord?.localVideoPath && sourceRecord.downloadStatus === "source-ready") {
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
            "content-type": guessContentType(filename, sourceRecord.mimeType ?? null),
            "content-length": String(stat.size),
            "content-disposition": buildAttachmentDisposition(filename),
            "cache-control": "private, no-store",
            "x-kimono-source": "db",
          },
        });
      } catch {
        return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-kimono-source": "stale" } });
      }
    }
  }

  const hybridContent = createHybridContentService();
  let detail;
  try {
    detail = await hybridContent.getPostDetail({
      site,
      service,
      creatorId,
      postId,
    });
  } catch {
    return NextResponse.json({ error: "post detail unavailable" }, { status: 502, headers: { "x-kimono-source": "stale" } });
  }

  const requestedSource = resolveRequestedPostVideoSource(detail.post, mediaPath);
  if (!requestedSource) {
    return NextResponse.json({ error: "Video not found on this post" }, { status: 404, headers: { "x-kimono-source": "stale" } });
  }

  const upstreamResponse = await fetch(requestedSource.upstreamUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      referer: site === "coomer" ? "https://coomer.st/" : "https://kemono.cr/",
      accept: "text/css",
    },
    redirect: "follow",
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return NextResponse.json({ error: "Upstream download failed" }, { status: 502, headers: { "x-kimono-source": "stale" } });
  }

  return new NextResponse(upstreamResponse.body, {
    headers: {
      "content-type": guessContentType(filename, upstreamResponse.headers.get("content-type")),
      "content-length": upstreamResponse.headers.get("content-length") ?? "",
      "content-disposition": buildAttachmentDisposition(filename),
      "cache-control": "private, no-store",
      "x-kimono-source": "upstream",
    },
  });
}

