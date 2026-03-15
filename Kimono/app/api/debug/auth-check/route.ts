export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  collectAuthDebugSnapshot,
  collectPublicRuntimeEnvProbe,
} from "@/lib/auth-debug-route";
import { getCurrentDiagnosticAccessDecision } from "@/lib/diagnostic-access";

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

  const runtime = collectPublicRuntimeEnvProbe();
  const auth = await collectAuthDebugSnapshot();

  return NextResponse.json({
    ok: true,
    runtime,
    auth,
  });
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return notFoundResponse();
  }

  return GET(request);
}
