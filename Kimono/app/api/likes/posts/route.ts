import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { logAppError } from "@/lib/app-logger";
import { getDataStore, type SupportedSite } from "@/lib/data-store";
import { loadStoredKimonoSessionCookie } from "@/lib/remote-session";
import { getLikesPostsPayload } from "@/lib/likes-posts-route";

export const dynamic = "force-dynamic";

function getBaseUrl(site: SupportedSite) {
  return site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
}

async function persistFavoriteChronology(input: {
  kind: "post";
  site: SupportedSite;
  service: string;
  creatorId: string;
  postId: string;
  action: "upsert" | "delete";
}) {
  const store = await getDataStore();

  try {
    if (input.action === "upsert") {
      await store.upsertFavoriteChronology({
        kind: input.kind,
        site: input.site,
        service: input.service,
        creatorId: input.creatorId,
        postId: input.postId,
        favoritedAt: new Date(),
      });
      return;
    }

    await store.deleteFavoriteChronology({
      kind: input.kind,
      site: input.site,
      service: input.service,
      creatorId: input.creatorId,
      postId: input.postId,
    });
  } finally {
    await store.disconnect();
  }
}

export async function GET(request: NextRequest) {
  const site = request.nextUrl.searchParams.get("site");
  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Invalid site" }, { status: 400 });
  }

  const payload = await getLikesPostsPayload({
    site: site as SupportedSite,
  });

  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId, postId } = body;
    if (!service || !creatorId || !postId || (site !== "kemono" && site !== "coomer")) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    await axios.post(
      `${getBaseUrl(site)}/api/v1/favorites/post/${service}/${creatorId}/${postId}`,
      null,
      {
        headers: {
          Cookie: cookie,
          Accept: "text/css",
        },
        timeout: 15000,
      }
    );

    try {
      await persistFavoriteChronology({
        kind: "post",
        site,
        service,
        creatorId,
        postId,
        action: "upsert",
      });
    } catch (chronologyError) {
      await logAppError("db", "likes/posts chronology upsert failed", chronologyError, {
        details: {
          route: "/api/likes/posts",
          method: "POST",
          site,
          service,
          creatorId,
          postId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAppError("api", "likes/posts POST error", error, {
      details: {
        route: "/api/likes/posts",
        method: "POST",
      },
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { site, service, creatorId, postId } = body;
    if (!service || !creatorId || !postId || (site !== "kemono" && site !== "coomer")) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const cookie = await loadStoredKimonoSessionCookie(site);
    if (!cookie) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    await axios.delete(
      `${getBaseUrl(site)}/api/v1/favorites/post/${service}/${creatorId}/${postId}`,
      {
        headers: {
          Cookie: cookie,
          Accept: "text/css",
        },
        timeout: 15000,
      }
    );

    try {
      await persistFavoriteChronology({
        kind: "post",
        site,
        service,
        creatorId,
        postId,
        action: "delete",
      });
    } catch (chronologyError) {
      await logAppError("db", "likes/posts chronology delete failed", chronologyError, {
        details: {
          route: "/api/likes/posts",
          method: "DELETE",
          site,
          service,
          creatorId,
          postId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAppError("api", "likes/posts DELETE error", error, {
      details: {
        route: "/api/likes/posts",
        method: "DELETE",
      },
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
