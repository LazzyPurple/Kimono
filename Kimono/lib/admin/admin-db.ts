import { db, withDbConnection } from "@/lib/db/index";
import { getLocalPrismaClient } from "@/lib/prisma";

export type AdminDbTableKey =
  | "Creator"
  | "Post"
  | "MediaAsset"
  | "MediaSource"
  | "FavoriteChronology"
  | "FavoriteCache"
  | "KimonoSession"
  | "DiscoveryCache"
  | "DiscoveryBlock";

type TableMeta = {
  label: string;
  orderBy: string;
  columns: string[];
  description: string;
};

type RawRecord = Record<string, unknown>;

const TABLES: Record<AdminDbTableKey, TableMeta> = {
  Creator: {
    label: "Creator",
    orderBy: "catalogSyncedAt DESC",
    columns: ["site", "service", "creatorId", "name", "favorited", "updated", "catalogSyncedAt"],
    description: "Catalogue principal des createurs indexables.",
  },
  Post: {
    label: "Post",
    orderBy: "cachedAt DESC",
    columns: ["site", "service", "creatorId", "postId", "detailLevel", "sourceKind", "cachedAt"],
    description: "Posts caches, details et contextes Popular/Recent.",
  },
  MediaAsset: {
    label: "MediaAsset",
    orderBy: "lastSeenAt DESC",
    columns: ["site", "sourceFingerprint", "previewStatus", "mediaKind", "durationSeconds", "lastSeenAt"],
    description: "Assets media derives, thumbnails et clips locaux.",
  },
  MediaSource: {
    label: "MediaSource",
    orderBy: "lastSeenAt DESC",
    columns: ["site", "sourceFingerprint", "downloadStatus", "priorityClass", "fileSizeBytes", "lastSeenAt"],
    description: "Sources video locales avec retention playback/liked.",
  },
  FavoriteChronology: {
    label: "FavoriteChronology",
    orderBy: "favoritedAt DESC",
    columns: ["kind", "site", "service", "creatorId", "postId", "favoritedAt"],
    description: "Ordre local des favoris et likes.",
  },
  FavoriteCache: {
    label: "FavoriteCache",
    orderBy: "updatedAt DESC",
    columns: ["kind", "site", "updatedAt", "expiresAt"],
    description: "Fallback durable des favoris createurs et posts.",
  },
  KimonoSession: {
    label: "KimonoSession",
    orderBy: "savedAt DESC",
    columns: ["site", "username", "savedAt"],
    description: "Sessions sauvegardees pour Kemono et Coomer.",
  },
  DiscoveryCache: {
    label: "DiscoveryCache",
    orderBy: "updatedAt DESC",
    columns: ["site", "updatedAt", "expiresAt"],
    description: "Cache durable des recommandations Discover.",
  },
  DiscoveryBlock: {
    label: "DiscoveryBlock",
    orderBy: "blockedAt DESC",
    columns: ["site", "service", "creatorId", "blockedAt"],
    description: "Createurs bloques dans les surfaces de decouverte.",
  },
};

function getDriver(env: NodeJS.ProcessEnv = process.env): "mysql" | "sqlite" | "unknown" {
  const url = String(env.DATABASE_URL ?? "").toLowerCase();
  if (url.startsWith("mysql://")) {
    return "mysql";
  }
  if (url.startsWith("file:") || url.startsWith("sqlite:")) {
    return "sqlite";
  }
  return "unknown";
}

async function queryRows<T = RawRecord>(sql: string, values: unknown[] = []): Promise<T[]> {
  return withDbConnection(async (conn) => {
    if (conn) {
      const [rows] = await conn.query(sql, values as never[]);
      return rows as T[];
    }

    const prisma = getLocalPrismaClient() as unknown as {
      $queryRawUnsafe<R = T[]>(statement: string, ...args: unknown[]): Promise<R>;
    };
    return prisma.$queryRawUnsafe<T[]>(sql, ...values);
  });
}

function serializeCell(value: unknown): string | number | boolean | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  try {
    return JSON.stringify(value).slice(0, 180);
  } catch {
    return String(value);
  }
}

async function getTableCount(table: AdminDbTableKey): Promise<number> {
  const rows = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM \`${table}\``);
  return Number(rows[0]?.total ?? 0);
}

async function getTableSizeEstimate(table: AdminDbTableKey): Promise<number | null> {
  if (getDriver() !== "mysql") {
    return null;
  }

  const rows = await queryRows<{ sizeBytes: number }>(
    "SELECT COALESCE(data_length + index_length, 0) AS sizeBytes FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [table]
  );
  return rows[0] ? Number(rows[0].sizeBytes ?? 0) : null;
}

async function getRecentRows(table: AdminDbTableKey, limit = 6) {
  const meta = TABLES[table];
  const columnsSql = meta.columns.map((column) => `\`${column}\``).join(", ");
  const rows = await queryRows<RawRecord>(
    `SELECT ${columnsSql} FROM \`${table}\` ORDER BY ${meta.orderBy} LIMIT ?`,
    [limit]
  );

  return rows.map((row) =>
    Object.fromEntries(meta.columns.map((column) => [column, serializeCell(row[column])]))
  );
}

export async function getAdminDbOverview() {
  return Promise.all(
    (Object.keys(TABLES) as AdminDbTableKey[]).map(async (table) => ({
      table,
      label: TABLES[table].label,
      description: TABLES[table].description,
      count: await getTableCount(table),
      sizeEstimateBytes: await getTableSizeEstimate(table),
      recentRows: await getRecentRows(table, table === "Creator" ? 4 : 3),
    }))
  );
}

export async function getAdminCreatorExplorer(input: {
  q: string;
  sort: "favorited" | "updated" | "name";
  page: number;
  perPage: number;
}) {
  return withDbConnection((conn) => db.searchCreators(conn as never, {
    q: input.q,
    page: input.page,
    perPage: input.perPage,
    sort: input.sort,
  }));
}

export async function getAdminTablePayload(input: {
  table: AdminDbTableKey;
  q?: string;
  sort?: "favorited" | "updated" | "name";
  page?: number;
  perPage?: number;
}) {
  if (input.table === "Creator") {
    const q = input.q?.trim() ?? "";
    const sort = input.sort ?? "favorited";
    const page = Math.max(1, Number(input.page ?? 1));
    const perPage = Math.max(1, Math.min(100, Number(input.perPage ?? 25)));

    return {
      table: input.table,
      mode: "creator-index" as const,
      data: await getAdminCreatorExplorer({ q, sort, page, perPage }),
    };
  }

  return {
    table: input.table,
    mode: "table" as const,
    data: {
      count: await getTableCount(input.table),
      sizeEstimateBytes: await getTableSizeEstimate(input.table),
      recentRows: await getRecentRows(input.table, Math.max(1, Math.min(25, Number(input.perPage ?? 8)))),
    },
  };
}
