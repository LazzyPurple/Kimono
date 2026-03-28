import { NextResponse } from "next/server";

import { getAdminSessionsData } from "@/lib/admin/admin-sessions";
import { isAdminApiAuthorized } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminApiAuthorized(request))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await getAdminSessionsData());
}
