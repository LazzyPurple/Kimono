import path from "node:path";
import { promises as fs } from "node:fs";

import { NextResponse } from "next/server";

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

export async function GET(
  _request: Request,
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
    const fileBuffer = await fs.readFile(absolutePath);
    const contentType = CONTENT_TYPES.get(path.extname(absolutePath).toLowerCase()) ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
