import mysql from "mysql2/promise";

const globalForDb = global as unknown as { pool?: mysql.Pool };

export const pool =
  globalForDb.pool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

/**
 * Execute a raw query against the MySQL database.
 */
export async function query<T = any>(
  sql: string,
  values?: any[]
): Promise<T[]> {
  const [rows] = await pool.execute(sql, values);
  return rows as T[];
}

/**
 * Execute a query that modifies the database (INSERT, UPDATE, DELETE).
 * Returns the ResultSetHeader.
 */
export async function execute(
  sql: string,
  values?: any[]
): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, values);
  return result as mysql.ResultSetHeader;
}
