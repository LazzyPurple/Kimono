import { NextResponse } from "next/server";

import { db, withDbConnection, type KimonoSite } from "@/lib/db/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    site: string;
    service: string;
    creatorId: string;
    postId: string;
  }>;
}

function normalizeSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

export async function POST(_request: Request, context: RouteContext) {
  const { site: rawSite, service, creatorId, postId } = await context.params;
  const site = normalizeSite(rawSite);
  if (!site || !service || !creatorId || !postId) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  await withDbConnection((conn) =>
    db.upsertFavoriteChronologyEntry(conn, {
      kind: "post",
      site,
      service,
      creatorId,
      postId,
      favoritedAt: new Date(),
      lastConfirmedAt: new Date(),
      favedSeq: null,
    }),
  );

  return NextResponse.json({ ok: true }, { headers: { "x-kimono-source": "db" } });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { site: rawSite, service, creatorId, postId } = await context.params;
  const site = normalizeSite(rawSite);
  if (!site || !service || !creatorId || !postId) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  await withDbConnection((conn) =>
    db.deleteFavoriteChronologyEntry(conn, "post", site, service, creatorId, postId),
  );

  return NextResponse.json({ ok: true }, { headers: { "x-kimono-source": "db" } });
}
