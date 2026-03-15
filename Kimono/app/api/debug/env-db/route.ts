export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { collectDatabaseUrlDebugPayload } from "@/lib/auth-debug-route";

export async function GET() {
  return NextResponse.json(collectDatabaseUrlDebugPayload());
}