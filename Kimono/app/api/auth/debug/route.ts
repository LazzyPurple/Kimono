import { NextResponse } from "next/server";
import {
  collectAuthDebugSnapshot,
  collectPublicRuntimeEnvProbe,
  probeAdminPassword,
  simulateMasterPasswordAuthorize,
} from "@/lib/auth-debug-route";
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

  return NextResponse.json({
    runtime: collectPublicRuntimeEnvProbe(),
    auth: await collectAuthDebugSnapshot(),
  });
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return notFoundResponse();
  }

  let body: { password?: string | null } | null = null;
  try {
    body = (await request.json()) as { password?: string | null };
  } catch {
    body = null;
  }

  const password = typeof body?.password === "string" ? body.password : null;

  return NextResponse.json({
    runtime: collectPublicRuntimeEnvProbe(),
    auth: await collectAuthDebugSnapshot(),
    passwordProbe: probeAdminPassword(password),
    authorizeSimulation: password ? await simulateMasterPasswordAuthorize(password) : null,
  });
}
