import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import {
  buildMediaSourcePublicUrl,
  createPopularPreviewAssetService,
} from "@/lib/popular-preview-assets";
import { getPerformanceRepository } from "@/lib/db/index";
import { resolveRequestedPostVideoSource } from "@/lib/post-video-sources";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const site = body?.site;
  const service = typeof body?.service === "string" ? body.service : "";
  const creatorId = typeof body?.creatorId === "string" ? body.creatorId : "";
  const postId = typeof body?.postId === "string" ? body.postId : "";
  const mediaPath = typeof body?.path === "string" ? body.path : "";
  const sourceFingerprint = typeof body?.sourceFingerprint === "string" ? body.sourceFingerprint : "";

  if (!site || (site !== "kemono" && site !== "coomer") || !service || !creatorId || !postId || !mediaPath) {
    return NextResponse.json({ error: "Invalid warm request" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  if (site !== "coomer") {
    return NextResponse.json({ error: "Playback warmup is only enabled for Coomer" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  const repository = await getPerformanceRepository();

  if (sourceFingerprint) {
    const cachedSource = await repository.getMediaSourceCache({ site, sourceFingerprint });
    if (cachedSource) {
      const localSourceAvailable = Boolean(cachedSource.localVideoPath) && cachedSource.downloadStatus === "source-ready";
      return NextResponse.json({
        path: mediaPath,
        sourceFingerprint,
        upstreamUrl: cachedSource.sourceVideoUrl,
        localSourceAvailable,
        sourceCacheStatus: cachedSource.downloadStatus ?? null,
        localStreamUrl: localSourceAvailable ? buildMediaSourcePublicUrl(site, sourceFingerprint) : null,
      }, {
        headers: {
          "x-kimono-source": localSourceAvailable ? "db" : "stale",
        },
      });
    }
  }

  const cookie = await loadStoredKimonoSessionCookie(site);
  const result = await hybridContent.getPostDetail({
    site,
    service,
    creatorId,
    postId,
    cookie: cookie ?? undefined,
  });

  const requestedSource = resolveRequestedPostVideoSource(result.post, mediaPath);
  if (!requestedSource) {
    return NextResponse.json({ error: "Video path does not belong to the requested post" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  const previewAssetService = createPopularPreviewAssetService({ repository });
  const warmedSource = await previewAssetService.warmSourceForPostVideo({
    site,
    post: result.post,
    videoPath: requestedSource.path,
    priorityClass: "playback",
  });

  if (!warmedSource) {
    return NextResponse.json({ error: "Video path does not belong to the requested post" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  return NextResponse.json(warmedSource, {
    headers: {
      "x-kimono-source": warmedSource.localSourceAvailable ? "db" : "upstream",
    },
  });
}
