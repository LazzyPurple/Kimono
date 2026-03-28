import { NextResponse } from "next/server";

import { getAdminTablePayload, type AdminDbTableKey } from "@/lib/admin/admin-db";
import { isAdminApiAuthorized } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABLES = new Set<AdminDbTableKey>([
  "Creator",
  "Post",
  "MediaAsset",
  "MediaSource",
  "FavoriteChronology",
  "FavoriteCache",
  "KimonoSession",
  "DiscoveryCache",
  "DiscoveryBlock",
]);

export async function GET(request: Request, context: { params: Promise<{ table: string }> }) {
  if (!(await isAdminApiAuthorized(request))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { table } = await context.params;
  if (!TABLES.has(table as AdminDbTableKey)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  const url = new URL(request.url);
  const payload = await getAdminTablePayload({
    table: table as AdminDbTableKey,
    q: url.searchParams.get("q") ?? undefined,
    sort: (url.searchParams.get("sort") as "favorited" | "updated" | "name" | null) ?? undefined,
    page: Number(url.searchParams.get("page") ?? "1") || 1,
    perPage: Number(url.searchParams.get("perPage") ?? "8") || 8,
  });

  return NextResponse.json(payload);
}
