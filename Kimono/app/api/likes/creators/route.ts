import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import axios from "axios";

export const dynamic = "force-dynamic";

function getBaseUrl(site: string) {
  return site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
}

async function getSessionCookie(site: string): Promise<string | null> {
  const sessions = await query<any>(
    "SELECT * FROM KimonoSession WHERE site = ? ORDER BY savedAt DESC LIMIT 1",
    [site]
  );
  const session = sessions[0];
  return session?.cookie ?? null;
}

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site");
  if (!site || (site !== "kemono" && site !== "coomer")) {
    return NextResponse.json([]);
  }

  const cookie = await getSessionCookie(site);
  if (!cookie) return NextResponse.json([]);

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
  } catch (err) {
    console.error("likes/creators GET error:", err);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId } = body;
    if (!site || !service || !creatorId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await getSessionCookie(site);
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
  } catch (err) {
    console.error("likes/creators POST error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId } = body;
    if (!site || !service || !creatorId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await getSessionCookie(site);
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
  } catch (err) {
    console.error("likes/creators DELETE error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
