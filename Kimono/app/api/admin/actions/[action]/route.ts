import { NextResponse } from "next/server";

import { runAdminAction, type AdminActionKey, ADMIN_ACTION_KEYS } from "@/lib/admin/admin-actions";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if (!(await isAuthorized(request))) {
    return notFoundResponse();
  }

  const resolvedParams = await params;
  const action = resolvedParams.action as AdminActionKey;
  if (!ADMIN_ACTION_KEYS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const result = await runAdminAction(action);
  return NextResponse.json(result);
}
