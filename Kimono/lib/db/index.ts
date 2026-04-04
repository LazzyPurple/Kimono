import * as prodRepo from "./repository.ts";
import { reserveConnection, type DbConnection } from "../db.ts";

export const db = prodRepo;

export async function withDbConnection<T>(work: (conn: DbConnection) => Promise<T>): Promise<T> {
  const conn = await reserveConnection();
  try {
    return await work(conn);
  } finally {
    await conn.release();
  }
}

export function isProductionDb(): boolean {
  return true;
}

export type Connection = DbConnection;
export type DB = typeof db;

export * from "./auth-store.ts";
export * from "./types.ts";
