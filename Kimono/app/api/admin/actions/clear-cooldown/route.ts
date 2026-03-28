import { NextResponse } from "next/server";

import { runAdminClearCooldown } from "@/lib/admin/admin-actions";
import { isAdminApiAuthorized } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminApiAuthorized(request))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as { site?: "kemono" | "coomer"; bucket?: string | null };
  const site = body.site === "kemono" || body.site === "coomer" ? body.site : "coomer";
  const bucket = typeof body.bucket === "string" && body.bucket ? body.bucket : null;

  return NextResponse.json(await runAdminClearCooldown(site, bucket as any));
}
