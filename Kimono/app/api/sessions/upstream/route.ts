import { NextRequest, NextResponse } from "next/server";

import { processKimonoLogin } from "@/lib/kimono-login-route";
import { db, withDbConnection, type KimonoSite } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

function parseSite(value: string | null): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

export async function GET(request: NextRequest) {
  const site = parseSite(request.nextUrl.searchParams.get("site"));

  try {
    if (site) {
      const session = await withDbConnection((conn) => db.getLatestKimonoSession(conn as any, site));
      return NextResponse.json({ site, loggedIn: Boolean(session), username: session?.username ?? null }, {
        headers: { "x-kimono-source": session ? "db" : "stale" },
      });
    }

    const [kemono, coomer] = await Promise.all([
      withDbConnection((conn) => db.getLatestKimonoSession(conn as any, "kemono")),
      withDbConnection((conn) => db.getLatestKimonoSession(conn as any, "coomer")),
    ]);

    return NextResponse.json({
      kemono: { loggedIn: Boolean(kemono), username: kemono?.username ?? null },
      coomer: { loggedIn: Boolean(coomer), username: coomer?.username ?? null },
    }, {
      headers: { "x-kimono-source": "db" },
    });
  } catch (error) {
    await logAppError("api", "sessions/upstream GET error", error, {
      details: { route: "/api/sessions/upstream", site: site ?? null },
    });
    return NextResponse.json({ error: "Unable to load session status" }, { status: 503, headers: { "x-kimono-source": "stale" } });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const site = parseSite(body?.site ?? null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!site || !username || !password) {
    return NextResponse.json({ error: "Invalid upstream session payload" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  const result = await processKimonoLogin({ site, username, password });
  const response = NextResponse.json(result.body, { status: result.status, headers: result.headers });
  response.headers.set("x-kimono-source", result.status >= 200 && result.status < 300 ? "upstream" : "stale");
  return response;
}


export async function DELETE(request: NextRequest) {
  const site = parseSite(request.nextUrl.searchParams.get("site"));

  if (!site) {
    return NextResponse.json({ error: "Invalid site" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    await withDbConnection((conn) => db.deleteKimonoSession(conn as any, site));
    return NextResponse.json({ ok: true, site }, { headers: { "x-kimono-source": "db" } });
  } catch (error) {
    await logAppError("api", "sessions/upstream DELETE error", error, {
      details: { route: "/api/sessions/upstream", site },
    });
    return NextResponse.json({ error: "Unable to clear session" }, { status: 503, headers: { "x-kimono-source": "stale" } });
  }
}
