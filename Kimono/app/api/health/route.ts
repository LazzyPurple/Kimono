import { NextResponse } from "next/server";
import { getCurrentDiagnosticAccessDecision } from "@/lib/diagnostic-access";
import { getServerHealthPayload } from "@/lib/server-health";

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

  return NextResponse.json(await getServerHealthPayload());
}
