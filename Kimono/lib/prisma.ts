import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

/**
 * Client Prisma v7 singleton.
 * Utilise la configuration standard définie dans schema.prisma et DATABASE_URL.
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
