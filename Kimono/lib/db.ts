import postgres, { type Sql } from "postgres";

type RowRecord = Record<string, unknown>;
type QueryRows<T extends RowRecord = RowRecord> = T[];

export interface DbExecuteResult {
  affectedRows: number;
}

export interface DbConnection {
  query<T extends RowRecord = RowRecord>(statement: string, values?: unknown[]): Promise<[QueryRows<T>]>;
  execute(statement: string, values?: unknown[]): Promise<[DbExecuteResult]>;
  release(): Promise<void>;
}

type PostgresClient = Pick<Sql, "unsafe">;

const globalForDb = globalThis as typeof globalThis & {
  __kimonoPgPool?: Sql;
};

function normalizeSql(statement: string): string {
  let parameterIndex = 0;

  return statement
    .replace(/`(User|Session|Passkey)`/g, '"$1"')
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\bNOW\(3\)\b/g, "CURRENT_TIMESTAMP")
    .replace(/\bNOW\(\)\b/g, "CURRENT_TIMESTAMP")
    .replace(/\?/g, () => `$${++parameterIndex}`);
}

function wrapRowAccess<T extends RowRecord>(row: T): T {
  return new Proxy(row, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      const lowered = property.toLowerCase();
      if (Reflect.has(target, lowered)) {
        return Reflect.get(target, lowered, receiver);
      }

      return undefined;
    },
  });
}

function wrapRows<T extends RowRecord = RowRecord>(rows: T[]): T[] {
  return rows.map((row) => wrapRowAccess(row));
}

async function runQuery<T extends RowRecord = RowRecord>(
  client: PostgresClient,
  statement: string,
  values: unknown[] = [],
): Promise<T[]> {
  const rows = await client.unsafe(normalizeSql(statement), values as never[]);
  return wrapRows(rows as unknown as T[]);
}

async function runExecute(
  client: PostgresClient,
  statement: string,
  values: unknown[] = [],
): Promise<DbExecuteResult> {
  const result = await client.unsafe(normalizeSql(statement), values as never[]);
  return {
    affectedRows: typeof (result as { count?: unknown }).count === "number"
      ? Number((result as { count: number }).count)
      : 0,
  };
}

export const pool =
  globalForDb.__kimonoPgPool ??
  postgres(process.env.DATABASE_URL ?? "", {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    transform: {
      undefined: null,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__kimonoPgPool = pool;
}

function createConnectionAdapter(client: PostgresClient, release: () => Promise<void>): DbConnection {
  return {
    async query<T extends RowRecord = RowRecord>(statement: string, values: unknown[] = []) {
      return [await runQuery<T>(client, statement, values)];
    },
    async execute(statement: string, values: unknown[] = []) {
      return [await runExecute(client, statement, values)];
    },
    release,
  };
}

export async function reserveConnection(): Promise<DbConnection> {
  const reserved = await pool.reserve();
  return createConnectionAdapter(reserved, async () => {
    await reserved.release();
  });
}

export async function query<T extends RowRecord = RowRecord>(
  statement: string,
  values: unknown[] = [],
): Promise<T[]> {
  return runQuery<T>(pool, statement, values);
}

export async function execute(
  statement: string,
  values: unknown[] = [],
): Promise<DbExecuteResult> {
  return runExecute(pool, statement, values);
}

export async function disconnect(): Promise<void> {
  await pool.end({ timeout: 5 });
}

export { normalizeSql };
