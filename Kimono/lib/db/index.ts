import type { Connection } from "mysql2/promise";

import * as prodRepo from "./repository.ts";
import { pool } from "../db.ts";

const isProd = process.env.DATABASE_URL?.startsWith("mysql");

type RepositoryModule = typeof prodRepo;

let localRepoPromise: Promise<RepositoryModule> | null = null;

async function getRepositoryModule(): Promise<RepositoryModule> {
  if (isProd) {
    return prodRepo;
  }

  if (!localRepoPromise) {
    localRepoPromise = import("./local-repository.ts") as Promise<RepositoryModule>;
  }

  return localRepoPromise;
}

export const db: RepositoryModule = new Proxy({} as RepositoryModule, {
  get(_target, property) {
    return async (...args: unknown[]) => {
      const repository = await getRepositoryModule();
      const value = Reflect.get(repository, property);
      if (typeof value !== "function") {
        return value;
      }
      return Reflect.apply(value, repository, args);
    };
  },
});

export async function withDbConnection<T>(
  work: (conn: Connection | undefined) => Promise<T>
): Promise<T> {
  if (!isProd) {
    return work(undefined);
  }

  const conn = await pool.getConnection();
  try {
    return await work(conn);
  } finally {
    conn.release();
  }
}

export function isProductionDb(): boolean {
  return Boolean(isProd);
}

export type DB = typeof db;

export * from "./app-store.ts";
export * from "./performance.ts";
export * from "./performance-cache.ts";
export * from "./types.ts";
