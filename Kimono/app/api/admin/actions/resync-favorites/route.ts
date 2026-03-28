import { NextResponse } from "next/server";

import { runAdminFavoritesResync } from "@/lib/admin/admin-actions";
import { isAdminApiAuthorized } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminApiAuthorized(request))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await runAdminFavoritesResync());
}
