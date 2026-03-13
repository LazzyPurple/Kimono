import { NextResponse } from "next/server";
import { getLogsDashboardData } from "@/lib/logs-dashboard";
import { ingestLogsRoutePayload } from "@/lib/logs-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(await getLogsDashboardData({ url: request.url }));
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  return NextResponse.json(await ingestLogsRoutePayload(body));
}
