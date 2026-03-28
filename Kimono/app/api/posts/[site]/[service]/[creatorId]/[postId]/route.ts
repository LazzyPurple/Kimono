import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";
import type { KimonoSite } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

function parseSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

function resolveKimonoSourceHeader(source: string): "db" | "upstream" | "stale" {
  if (source === "cache") {
    return "db";
  }

  if (source === "stale-cache") {
    return "stale";
  }

  return "upstream";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ site: string; service: string; creatorId: string; postId: string }> }
) {
  const params = await context.params;
  const site = parseSite(params.site);
  const service = params.service?.trim() ?? "";
  const creatorId = params.creatorId?.trim() ?? "";
  const postId = params.postId?.trim() ?? "";

  if (!site || !service || !creatorId || !postId) {
    return NextResponse.json({ error: "Invalid post params" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const cookie = await loadStoredKimonoSessionCookie(site);
    const result = await hybridContent.getPostDetail({
      site,
      service,
      creatorId,
      postId,
      cookie: cookie ?? undefined,
    });

    return NextResponse.json(result.post, {
      headers: {
        "x-kimono-source": resolveKimonoSourceHeader(result.source),
      },
    });
  } catch (error) {
    await logAppError("api", "posts detail route error", error, {
      details: { route: "/api/posts/[site]/[service]/[creatorId]/[postId]", site, service, creatorId, postId },
    });
    return NextResponse.json({ error: "Unable to load post" }, { status: 503, headers: { "x-kimono-source": "stale" } });
  }
}