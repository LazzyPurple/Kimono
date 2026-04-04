import { NextResponse } from "next/server";

import { getDataStore } from "@/lib/db/index";
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ site: string }> },
) {
  if (!(await isAuthorized(request))) {
    return notFoundResponse();
  }

  const resolvedParams = await params;
  if (resolvedParams.site !== "kemono" && resolvedParams.site !== "coomer") {
    return NextResponse.json({ error: "Unknown site" }, { status: 400 });
  }

  const store = await getDataStore();
  try {
    await store.deleteKimonoSession(resolvedParams.site);
  } finally {
    await store.disconnect();
  }

  return NextResponse.json({ ok: true, site: resolvedParams.site });
}
