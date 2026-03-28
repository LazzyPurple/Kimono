import { NextResponse } from "next/server";

import { disconnectAdminSession } from "@/lib/admin/admin-sessions";
import { isAdminApiAuthorized } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ site: string }> }) {
  if (!(await isAdminApiAuthorized(request))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { site } = await context.params;
  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Unknown site" }, { status: 400 });
  }

  return NextResponse.json(await disconnectAdminSession(site));
}
