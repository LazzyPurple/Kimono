import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import type { PopularPeriod } from "@/lib/perf-cache";

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
  const rawPeriods = Array.isArray(body?.periods) ? body.periods : [];
  const periods = rawPeriods.filter((period: unknown): period is PopularPeriod => period === "recent" || period === "day" || period === "week" || period === "month");
  const rawOffsets = Array.isArray(body?.recentOffsets) ? body.recentOffsets : [];
  const recentOffsets = rawOffsets
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value >= 0);

  const result = await hybridContent.runPopularWarmupJob({
    sites: sites.length > 0 ? sites : undefined,
    periods: periods.length > 0 ? periods : undefined,
    recentOffsets: recentOffsets.length > 0 ? recentOffsets : undefined,
  });

  return NextResponse.json(result);
}
