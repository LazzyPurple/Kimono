import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";

const hybridContent = createHybridContentService();

function isAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  return (
    request.headers.get("x-cron-secret") === secret ||
    request.nextUrl.searchParams.get("secret") === secret
  );
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const rawSites = Array.isArray(body?.sites) ? body.sites : [];
  const sites = rawSites.filter((site: unknown): site is "kemono" | "coomer" => site === "kemono" || site === "coomer");

  const result = await hybridContent.runCreatorSnapshotJob({
    sites: sites.length > 0 ? sites : undefined,
  });

  return NextResponse.json(result);
}
