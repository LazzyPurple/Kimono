import { NextRequest, NextResponse } from "next/server";

import { createHybridContentService } from "@/lib/hybrid-content";
import { logAppError } from "@/lib/app-logger";
import type { SearchFilter, SearchSort } from "@/lib/perf-cache";

const hybridContent = createHybridContentService();

function parseFilter(value: string | null): SearchFilter {
  return value === "kemono" || value === "coomer" || value === "liked" ? value : "tous";
}

function parseSort(value: string | null): SearchSort {
  return value === "date" || value === "az" ? value : "favorites";
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
  const sort = parseSort(request.nextUrl.searchParams.get("sort"));
  const service = request.nextUrl.searchParams.get("service") ?? "Tous";
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("perPage") ?? "50") || 50));
  const likedCreatorKeys = request.nextUrl.searchParams.getAll("liked");

  try {
    const result = await hybridContent.searchCreatorsPage({
      q: query,
      filter,
      sort,
      service,
      page,
      perPage,
      likedCreatorKeys,
    });

    return NextResponse.json(result, {
      headers: {
        "x-kimono-source": result.source,
      },
    });
  } catch (error) {
    await logAppError("api", "search-creators error", error, {
      details: {
        route: "/api/search-creators",
        q: query || null,
        filter,
        sort,
        service,
        page,
        perPage,
        likedCount: likedCreatorKeys.length,
      },
    });

    return NextResponse.json(
      {
        items: [],
        total: 0,
        page,
        perPage,
        services: [],
        syncedAt: null,
        source: "stale-cache",
      },
      { status: 200 }
    );
  }
}
