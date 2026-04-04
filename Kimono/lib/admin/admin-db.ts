import { query } from "../db.ts";
import { db, withDbConnection } from "../db/index.ts";

import type { CreatorRow, SearchCreatorsResult } from "../db/types.ts";

export const ADMIN_DB_TABLES = [
  "Creator",
  "Post",
  "MediaAsset",
  "MediaSource",
  "FavoriteChronology",
  "FavoriteCache",
  "DiscoveryCache",
  "DiscoveryBlock",
  "KimonoSession",
  "User",
  "Session",
  "Passkey",
] as const;

export type AdminDbTableKey = typeof ADMIN_DB_TABLES[number];

export interface AdminDbTableSnapshot {
  key: AdminDbTableKey;
  rows: number;
  sizeBytes: number;
  sampleRows: unknown[];
}

export interface AdminCreatorSearchSnapshot {
  rows: Pick<CreatorRow, "site" | "service" | "creatorId" | "name" | "normalizedName" | "favorited" | "postCount" | "catalogSyncedAt">[];
  total: number;
  page: number;
  perPage: number;
  q: string;
  sort: "favorited" | "updated" | "name";
  order: "asc" | "desc";
  snapshotFresh: boolean;
}

export interface AdminDbSnapshot {
  tables: AdminDbTableSnapshot[];
  creatorSearch: AdminCreatorSearchSnapshot;
}

type TableStatsSnapshot = Record<AdminDbTableKey, Omit<AdminDbTableSnapshot, "key">>;

interface AdminDbDependencies {
  getTableStats?: () => Promise<TableStatsSnapshot>;
  searchCreators?: (input: {
    q?: string;
    page?: number;
    perPage?: number;
    sort?: "favorited" | "updated" | "name";
    order?: "asc" | "desc";
    site?: "kemono" | "coomer";
    service?: string;
  }) => Promise<SearchCreatorsResult>;
}

const TABLE_METADATA: Record<AdminDbTableKey, { sqlName: string; physicalName: string }> = {
  Creator: { sqlName: "Creator", physicalName: "creator" },
  Post: { sqlName: "Post", physicalName: "post" },
  MediaAsset: { sqlName: "MediaAsset", physicalName: "mediaasset" },
  MediaSource: { sqlName: "MediaSource", physicalName: "mediasource" },
  FavoriteChronology: { sqlName: "FavoriteChronology", physicalName: "favoritechronology" },
  FavoriteCache: { sqlName: "FavoriteCache", physicalName: "favoritecache" },
  DiscoveryCache: { sqlName: "DiscoveryCache", physicalName: "discoverycache" },
  DiscoveryBlock: { sqlName: "DiscoveryBlock", physicalName: "discoveryblock" },
  KimonoSession: { sqlName: "KimonoSession", physicalName: "kimonosession" },
  User: { sqlName: "\"User\"", physicalName: "User" },
  Session: { sqlName: "\"Session\"", physicalName: "Session" },
  Passkey: { sqlName: "\"Passkey\"", physicalName: "Passkey" },
};

function normalizeSite(site: string | null | undefined): "kemono" | "coomer" | undefined {
  if (site === "kemono" || site === "coomer") {
    return site;
  }
  return undefined;
}

function normalizeSort(sort: string | null | undefined): "favorited" | "updated" | "name" {
  return sort === "updated" || sort === "name" ? sort : "favorited";
}

function normalizeOrder(order: string | null | undefined): "asc" | "desc" {
  return order === "asc" ? "asc" : "desc";
}

async function getTableStats(): Promise<TableStatsSnapshot> {
  const entries = await Promise.all(
    ADMIN_DB_TABLES.map(async (key) => {
      const metadata = TABLE_METADATA[key];
      const [countRows, sizeRows, sampleRows] = await Promise.all([
        query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${metadata.sqlName}`),
        query<{ bytes: number }>(
          "SELECT COALESCE(pg_total_relation_size(c.oid), 0) AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relname = ? LIMIT 1",
          [metadata.physicalName],
        ),
        query<{ row: unknown }>(
          `SELECT row_to_json(t) AS row FROM (SELECT * FROM ${metadata.sqlName} LIMIT 5) t`,
        ),
      ]);

      return [
        key,
        {
          rows: Number(countRows[0]?.total ?? 0),
          sizeBytes: Number(sizeRows[0]?.bytes ?? 0),
          sampleRows: sampleRows.map((entry) => entry.row),
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as TableStatsSnapshot;
}

async function searchCreators(input: {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: "favorited" | "updated" | "name";
  order?: "asc" | "desc";
  site?: "kemono" | "coomer";
  service?: string;
}) {
  return withDbConnection((conn) => db.searchCreators(conn, input));
}

export function createAdminDbService(dependencies: AdminDbDependencies = {}) {
  return {
    async getSnapshot(input: {
      q?: string | null;
      page?: number | null;
      perPage?: number | null;
      sort?: string | null;
      order?: string | null;
      site?: string | null;
      service?: string | null;
    } = {}): Promise<AdminDbSnapshot> {
      const q = input.q?.trim() ?? "";
      const page = Math.max(1, Math.floor(input.page ?? 1));
      const perPage = Math.max(1, Math.min(100, Math.floor(input.perPage ?? 50)));
      const sort = normalizeSort(input.sort ?? undefined);
      const order = normalizeOrder(input.order ?? undefined);
      const site = normalizeSite(input.site ?? undefined);
      const service = input.service?.trim() || undefined;

      const [tableStats, creatorResult] = await Promise.all([
        (dependencies.getTableStats ?? getTableStats)(),
        (dependencies.searchCreators ?? searchCreators)({
          q,
          page,
          perPage,
          sort,
          order,
          site,
          service,
        }),
      ]);

      return {
        tables: ADMIN_DB_TABLES.map((key) => ({
          key,
          ...tableStats[key],
        })),
        creatorSearch: {
          rows: creatorResult.rows.map((row) => ({
            site: row.site,
            service: row.service,
            creatorId: row.creatorId,
            name: row.name,
            normalizedName: row.normalizedName,
            favorited: row.favorited,
            postCount: row.postCount,
            catalogSyncedAt: row.catalogSyncedAt,
          })),
          total: creatorResult.total,
          page,
          perPage,
          q,
          sort,
          order,
          snapshotFresh: creatorResult.snapshotFresh,
        },
      };
    },
  };
}

export async function getAdminDbSnapshot(input: Parameters<ReturnType<typeof createAdminDbService>["getSnapshot"]>[0]) {
  return createAdminDbService().getSnapshot(input);
}
