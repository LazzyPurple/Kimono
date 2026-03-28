import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { db, withDbConnection, type KimonoSite } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

const hybridContent = createHybridContentService();

function parseSite(value: string): KimonoSite | null {
  return value === "kemono" || value === "coomer" ? value : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ site: string; service: string; id: string }> }
) {
  const params = await context.params;
  const site = parseSite(params.site);
  const service = params.service?.trim() ?? "";
  const creatorId = params.id?.trim() ?? "";

  if (!site || !service || !creatorId) {
    return NextResponse.json({ error: "Invalid creator params" }, { status: 400, headers: { "x-kimono-source": "stale" } });
  }

  try {
    const cachedProfile = await withDbConnection((conn) => db.getCreatorById(conn as any, site, service, creatorId));
    if (cachedProfile?.rawProfilePayload && cachedProfile.profileExpiresAt && cachedProfile.profileExpiresAt.getTime() > Date.now()) {
      return NextResponse.json(JSON.parse(cachedProfile.rawProfilePayload), {
        headers: {
          "x-kimono-source": "db",
        },
      });
    }

    const result = await hybridContent.getCreatorProfile({ site, service, creatorId });
    return NextResponse.json(result.profile, {
      headers: {
        "x-kimono-source": result.source === "cache" ? "db" : result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "creators profile route error", error, {
      details: { route: "/api/creators/[site]/[service]/[id]", site, service, creatorId },
    });
    return NextResponse.json({ error: "Unable to load creator profile" }, { status: 503, headers: { "x-kimono-source": "stale" } });
  }
}

