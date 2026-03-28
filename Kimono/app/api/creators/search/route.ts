import { NextRequest, NextResponse } from "next/server";

import type { UnifiedCreator } from "@/lib/api/helpers";
import { db, withDbConnection, type CreatorRow, type KimonoSite, type SearchCreatorsOpts } from "@/lib/db/index";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

type SearchFilter = "tous" | "kemono" | "coomer" | "liked";

function parseSite(value: string | null): KimonoSite | undefined {
  return value === "kemono" || value === "coomer" ? value : undefined;
}

function parseFilter(value: string | null): SearchFilter {
  return value === "kemono" || value === "coomer" || value === "liked" ? value : "tous";
}

function parseSort(value: string | null): SearchCreatorsOpts["sort"] {
  if (value === "updated" || value === "date") {
    return "updated";
  }

  if (value === "name" || value === "az") {
    return "name";
  }

  return "favorited";
}

function parseOrder(value: string | null): SearchCreatorsOpts["order"] {
  return value === "asc" ? "asc" : "desc";
}

function normalizeService(value: string | null): string | undefined {
  const serviceRaw = value?.trim();
  if (!serviceRaw || serviceRaw === "Tous" || serviceRaw === "All") {
    return undefined;
  }

  return serviceRaw;
}

function matchesQuery(row: CreatorRow, q: string): boolean {
  const normalized = q.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return row.normalizedName.includes(normalized)
    || row.name.toLowerCase().includes(normalized)
    || row.creatorId.toLowerCase().includes(normalized);
}

function sortRows(rows: CreatorRow[], sort: SearchCreatorsOpts["sort"], order: SearchCreatorsOpts["order"]): CreatorRow[] {
  const direction = order === "asc" ? 1 : -1;

  return rows.slice().sort((left, right) => {
    const delta = sort === "name"
      ? left.normalizedName.localeCompare(right.normalizedName)
      : sort === "updated"
        ? (left.updated ?? 0) - (right.updated ?? 0)
        : (left.favorited ?? 0) - (right.favorited ?? 0);

    if (delta !== 0) {
      return delta * direction;
    }

    return left.normalizedName.localeCompare(right.normalizedName);
  });
}

function mapCreatorRow(row: CreatorRow): UnifiedCreator {
  return {
    id: row.creatorId,
    name: row.name,
    service: row.service,
    site: row.site,
    indexed: row.indexed != null ? String(row.indexed) : undefined,
    updated: row.updated != null ? String(row.updated) : undefined,
    favorited: row.favorited,
    public_id: row.publicId ?? undefined,
    relation_id: row.relationId ?? undefined,
    has_chats: row.hasChats,
    post_count: row.postCount,
    dm_count: row.dmCount,
    share_count: row.shareCount,
    chat_count: row.chatCount,
  };
}

function parseLikedKeys(values: string[]): Array<{ site: KimonoSite; service: string; creatorId: string }> {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.split("-"))
    .filter((parts): parts is [KimonoSite, string, string] => {
      return parts.length >= 3 && (parts[0] === "kemono" || parts[0] === "coomer");
    })
    .map(([site, service, ...creatorParts]) => ({
      site,
      service,
      creatorId: creatorParts.join("-"),
    }));
}

async function loadLikedRows(input: {
  q: string;
  site?: KimonoSite;
  service?: string;
  sort: SearchCreatorsOpts["sort"];
  order: SearchCreatorsOpts["order"];
  page: number;
  perPage: number;
  likedEntries: Array<{ site: KimonoSite; service: string; creatorId: string }>;
}) {
  const { q, site, service, sort, order, page, perPage, likedEntries } = input;

  const rows = await withDbConnection(async (conn) => {
    if (!conn) {
      return [] as CreatorRow[];
    }

    const uniqueEntries = Array.from(new Map(
      likedEntries.map((entry) => [`${entry.site}-${entry.service}-${entry.creatorId}`, entry])
    ).values());

    const creators = await Promise.all(
      uniqueEntries.map((entry) => db.getCreatorById(conn as never, entry.site, entry.service, entry.creatorId))
    );

    return creators.filter((row): row is CreatorRow => Boolean(row));
  });

  const filteredRows = rows.filter((row) => {
    if (site && row.site !== site) {
      return false;
    }

    if (service && row.service !== service) {
      return false;
    }

    return matchesQuery(row, q);
  });

  const orderedRows = sortRows(filteredRows, sort, order);
  const start = (page - 1) * perPage;

  return {
    rows: orderedRows.slice(start, start + perPage),
    total: orderedRows.length,
    services: Array.from(new Set(orderedRows.map((row) => row.service))).sort(),
    syncedAt: orderedRows.reduce<Date | null>((latest, row) => {
      if (!latest || row.catalogSyncedAt > latest) {
        return row.catalogSyncedAt;
      }
      return latest;
    }, null),
  };
}

async function resolveSnapshotFresh(site?: KimonoSite): Promise<boolean> {
  if (site) {
    return withDbConnection((conn) => db.isCreatorCatalogFresh(conn as never, site));
  }

  const [kemonoFresh, coomerFresh] = await Promise.all([
    withDbConnection((conn) => db.isCreatorCatalogFresh(conn as never, "kemono")),
    withDbConnection((conn) => db.isCreatorCatalogFresh(conn as never, "coomer")),
  ]);

  return kemonoFresh && coomerFresh;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim() ?? "";
  const filter = parseFilter(searchParams.get("filter"));
  const explicitSite = parseSite(searchParams.get("site"));
  const site = explicitSite ?? (filter === "kemono" || filter === "coomer" ? filter : undefined);
  const serviceRaw = searchParams.get("service");
  const service = normalizeService(serviceRaw);
  const sort = parseSort(searchParams.get("sort"));
  const order = parseOrder(searchParams.get("order"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? "50") || 50));
  const likedEntries = parseLikedKeys(searchParams.getAll("liked"));

  try {
    const snapshotFresh = await resolveSnapshotFresh(site);
    const source = snapshotFresh ? "db" : "stale";

    if (filter === "liked") {
      const likedResult = await loadLikedRows({ q, site, service, sort, order, page, perPage, likedEntries });

      return NextResponse.json(
        {
          items: likedResult.rows.map(mapCreatorRow),
          total: likedResult.total,
          page,
          perPage,
          services: likedResult.services,
          syncedAt: likedResult.syncedAt?.toISOString() ?? null,
          source,
        },
        {
          headers: {
            "x-kimono-source": source,
          },
        }
      );
    }

    const result = await withDbConnection((conn) => db.searchCreators(conn as never, { q, site, service, sort, order, page, perPage }));
    const services = Array.from(new Set(result.rows.map((row) => row.service))).sort();
    const syncedAt = result.rows.reduce<Date | null>((latest, row) => {
      if (!latest || row.catalogSyncedAt > latest) {
        return row.catalogSyncedAt;
      }
      return latest;
    }, null);

    return NextResponse.json(
      {
        items: result.rows.map(mapCreatorRow),
        total: result.total,
        page,
        perPage,
        services,
        syncedAt: syncedAt?.toISOString() ?? null,
        source,
      },
      {
        headers: {
          "x-kimono-source": source,
        },
      }
    );
  } catch (error) {
    await logAppError("api", "creators/search error", error, {
      details: {
        route: "/api/creators/search",
        q: q || null,
        filter,
        site: site ?? null,
        service: service ?? null,
        sort,
        order,
        page,
        perPage,
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
        source: "stale",
      },
      {
        status: 200,
        headers: {
          "x-kimono-source": "stale",
        },
      }
    );
  }
}
