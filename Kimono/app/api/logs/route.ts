import { NextResponse } from "next/server";
import { getLogsRoutePayload, ingestLogsRoutePayload } from "@/lib/logs-route";
import { getCurrentDiagnosticAccessDecision } from "@/lib/diagnostic-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFoundResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function isAuthorized(request: Request) {
  const decision = await getCurrentDiagnosticAccessDecision({
    headers: request.headers,
    url: request.url,
  });

  return decision.type === "allowed";
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return notFoundResponse();
  }

  return NextResponse.json(await getLogsRoutePayload(request.url));
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return notFoundResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  return NextResponse.json(await ingestLogsRoutePayload(body));
}
