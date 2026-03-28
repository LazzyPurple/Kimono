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

  const payload = await getLogsRoutePayload(request.url);
  const format = new URL(request.url).searchParams.get("format");

  if (format === "json") {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="kimono-logs-${timestamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(payload);
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
