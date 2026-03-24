import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { createPopularPreviewAssetService } from "@/lib/popular-preview-assets";
import { getPerformanceRepository } from "@/lib/perf-repository";
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

  if (!site || (site !== "kemono" && site !== "coomer") || !service || !creatorId || !postId || !mediaPath) {
    return NextResponse.json({ error: "Invalid warm request" }, { status: 400 });
  }

  if (site !== "coomer") {
    return NextResponse.json({ error: "Playback warmup is only enabled for Coomer" }, { status: 400 });
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
    return NextResponse.json({ error: "Video path does not belong to the requested post" }, { status: 400 });
  }

  const repository = await getPerformanceRepository();
  const previewAssetService = createPopularPreviewAssetService({ repository });
  const warmedSource = await previewAssetService.warmSourceForPostVideo({
    site,
    post: result.post,
    videoPath: requestedSource.path,
    priorityClass: "playback",
  });

  if (!warmedSource) {
    return NextResponse.json({ error: "Video path does not belong to the requested post" }, { status: 400 });
  }

  return NextResponse.json(warmedSource);
}
