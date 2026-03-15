export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { collectDatabaseUrlDebugPayload } from "@/lib/auth-debug-route";
import { getCurrentDiagnosticAccessDecision } from "@/lib/diagnostic-access";

function notFoundResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(request: Request) {
  const decision = await getCurrentDiagnosticAccessDecision({
    headers: request.headers,
    url: request.url,
  });

  if (decision.type !== "allowed") {
    return notFoundResponse();
  }

  return NextResponse.json(collectDatabaseUrlDebugPayload());
}
