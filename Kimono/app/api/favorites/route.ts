import { NextRequest, NextResponse } from "next/server";

import { db, withDbConnection, type KimonoSite } from "@/lib/db/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeSite(value: string | null): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

export async function GET(request: NextRequest) {
  const site = normalizeSite(request.nextUrl.searchParams.get("site"));
  if (!site) {
    return NextResponse.json(
      { error: "Invalid site" },
      { status: 400, headers: { "x-kimono-source": "db" } },
    );
  }

  const payload = await withDbConnection(async (conn) => {
    const [creatorChronology, postChronology] = await Promise.all([
      db.getFavoriteChronology(conn, "creator", site),
      db.getFavoriteChronology(conn, "post", site),
    ]);

    const favorites = await Promise.all(
      creatorChronology.map(async (entry, index) => {
        const creator = await db.getCreatorById(conn, site, entry.service, entry.creatorId);
        if (!creator) {
          return null;
        }

        return {
          id: creator.creatorId,
          site: creator.site,
          service: creator.service,
          name: creator.name,
          favorited: creator.favorited,
          updated: creator.updated != null ? new Date(creator.updated * 1000).toISOString() : null,
          postCount: creator.postCount,
          profileImageUrl: creator.profileImageUrl,
          bannerImageUrl: creator.bannerImageUrl,
          favoriteSourceIndex: index,
          favoriteAddedAt: entry.favoritedAt.toISOString(),
          favedSeq: entry.favedSeq,
        };
      }),
    );

    const items = await Promise.all(
      postChronology.map(async (entry, index) => {
        const post = await db.getPostById(conn, site, entry.service, entry.creatorId, entry.postId);
        if (!post) {
          return null;
        }

        return {
          id: post.postId,
          site: post.site,
          service: post.service,
          user: post.creatorId,
          creatorId: post.creatorId,
          title: post.title,
          favoriteSourceIndex: index,
          favoriteAddedAt: entry.favoritedAt.toISOString(),
          favedSeq: entry.favedSeq,
        };
      }),
    );

    return {
      loggedIn: true,
      expired: false,
      favorites: favorites.filter(Boolean),
      items: items.filter(Boolean),
    };
  });

  return NextResponse.json(payload, {
    headers: {
      "x-kimono-source": "db",
    },
  });
}
