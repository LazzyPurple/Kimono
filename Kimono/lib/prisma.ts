import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const DEFAULT_LOCAL_DATABASE_URL = "file:./dev.db";

const globalForPrisma = globalThis as typeof globalThis & {
  __kimonoPrisma?: PrismaClient;
};

export function resolveLocalPrismaDatabaseUrl(
  env: Record<string, string | undefined> = process.env
): string {
  if (env.DATABASE_URL && env.DATABASE_URL.startsWith("file:")) {
    return env.DATABASE_URL;
  }

  return DEFAULT_LOCAL_DATABASE_URL;
}

export function resolveLocalPrismaFilePath(
  databaseUrl = resolveLocalPrismaDatabaseUrl(),
  workspaceRoot = process.cwd()
): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported local Prisma database URL: ${databaseUrl}`);
  }

  try {
    return fileURLToPath(new URL(databaseUrl));
  } catch {
    const rawPath = databaseUrl.slice("file:".length);

    if (/^[A-Za-z]:[\\/]/.test(rawPath)) {
      return path.normalize(rawPath);
    }

    if (/^\/[A-Za-z]:[\\/]/.test(rawPath)) {
      return path.normalize(rawPath.slice(1));
    }

    const relativePath = rawPath.replace(/^\.\//, "");
    return path.resolve(workspaceRoot, "prisma", relativePath);
  }
}

export function createPrismaClient(
  databaseUrl = resolveLocalPrismaDatabaseUrl(),
  workspaceRoot = process.cwd()
): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: resolveLocalPrismaFilePath(databaseUrl, workspaceRoot),
  });

  return new PrismaClient({
    adapter,
  });
}

export function getLocalPrismaClient(databaseUrl?: string): PrismaClient {
  if (databaseUrl) {
    return createPrismaClient(databaseUrl);
  }

  if (!globalForPrisma.__kimonoPrisma) {
    globalForPrisma.__kimonoPrisma = createPrismaClient();
  }

  return globalForPrisma.__kimonoPrisma;
}
