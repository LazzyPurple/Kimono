import { NextRequest, NextResponse } from "next/server";
import type { Connection } from "mysql2/promise";

import { isAdminApiAuthorized } from "@/lib/admin/admin-access";
import { runCreatorSync } from "@/lib/jobs/creator-sync";
import { withDbConnection, db, type KimonoSite } from "@/lib/db/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isAdminApiAuthorized(request))) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-kimono-source": "stale" } });
  }

  const body = await request.json().catch(() => ({}));
  const rawSites = Array.isArray(body?.sites) ? body.sites : [];
  const sites = rawSites.filter((site: unknown): site is KimonoSite => site === "kemono" || site === "coomer");

  const results = await withDbConnection((conn) => runCreatorSync(conn as Connection, { force: true, sites: sites.length > 0 ? sites : undefined }));
  return NextResponse.json({ ok: true, results, dbReady: Boolean(db) }, { headers: { "x-kimono-source": "upstream" } });
}
