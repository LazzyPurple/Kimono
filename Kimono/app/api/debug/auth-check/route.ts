export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  collectAuthDebugSnapshot,
  collectPublicRuntimeEnvProbe,
  probeAdminPassword,
  simulateMasterPasswordAuthorize,
} from "@/lib/auth-debug-route";

export async function GET() {
  const runtime = collectPublicRuntimeEnvProbe();
  const auth = await collectAuthDebugSnapshot();

  return NextResponse.json({
    ok: true,
    runtime,
    auth,
    passwordProbe: probeAdminPassword(undefined),
    authorizationProbe: await simulateMasterPasswordAuthorize(undefined),
  });
}

export async function POST(request: Request) {
  let password: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.password === "string") {
      password = body.password;
    }
  } catch {
    password = undefined;
  }

  const runtime = collectPublicRuntimeEnvProbe();
  const auth = await collectAuthDebugSnapshot();

  return NextResponse.json({
    ok: true,
    runtime,
    auth,
    passwordProbe: probeAdminPassword(password),
    authorizationProbe: await simulateMasterPasswordAuthorize(password),
  });
}
