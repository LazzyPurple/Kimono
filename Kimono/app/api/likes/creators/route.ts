import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { logAppError } from "@/lib/app-logger";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";
import type { SupportedSite } from "@/lib/data-store";

export const dynamic = "force-dynamic";

function getBaseUrl(site: SupportedSite) {
  return site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
}

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site");
  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json([]);
  }

  const cookie = await loadStoredKimonoSessionCookie(site);
  if (!cookie) {
    return NextResponse.json([]);
  }

  try {
    const { data } = await axios.get(
      `${getBaseUrl(site)}/api/v1/account/favorites?type=artist`,
      {
        headers: {
          Cookie: cookie,
          Accept: "text/css",
        },
        timeout: 15000,
      }
    );
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error) {
    await logAppError("api", "likes/creators GET error", error, {
      details: {
        route: "/api/likes/creators",
        method: "GET",
        site,
      },
    });
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId } = body;
    if (!service || !creatorId || (site !== "kemono" && site !== "coomer")) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    await axios.post(
      `${getBaseUrl(site)}/api/v1/favorites/creator/${service}/${creatorId}`,
      null,
      {
        headers: {
          Cookie: cookie,
          Accept: "text/css",
        },
        timeout: 15000,
      }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAppError("api", "likes/creators POST error", error, {
      details: {
        route: "/api/likes/creators",
        method: "POST",
      },
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId } = body;
    if (!service || !creatorId || (site !== "kemono" && site !== "coomer")) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    await axios.delete(
      `${getBaseUrl(site)}/api/v1/favorites/creator/${service}/${creatorId}`,
      {
        headers: {
          Cookie: cookie,
          Accept: "text/css",
        },
        timeout: 15000,
      }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAppError("api", "likes/creators DELETE error", error, {
      details: {
        route: "/api/likes/creators",
        method: "DELETE",
      },
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
