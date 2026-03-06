import "server-only";
import prisma from "@/lib/prisma";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedCreators(site: string): Promise<any[] | null> {
  const row = await prisma.creatorsCache.findUnique({
    where: { site },
  });

  if (!row) {
    return null;
  }

  if (Date.now() - row.updatedAt.getTime() > CACHE_TTL_MS) {
    return null;
  }

  try {
    return JSON.parse(row.data);
  } catch (error) {
    return null;
  }
}

export async function setCachedCreators(site: string, data: any[]): Promise<void> {
  const jsonData = JSON.stringify(data);
  const now = new Date();

  await prisma.creatorsCache.upsert({
    where: { site },
    update: { data: jsonData, updatedAt: now },
    create: { site, data: jsonData, updatedAt: now },
  });
}
