import { query, execute } from "@/lib/db";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedCreators(site: string): Promise<any[] | null> {
  const rows = await query<any>("SELECT * FROM CreatorsCache WHERE site = ?", [site]);
  const row = rows[0];

  if (!row) {
    return null;
  }

  // Row updatedAt might come back as Date or string depending on mysql2 config
  const updatedAt = typeof row.updatedAt === "string" ? new Date(row.updatedAt) : row.updatedAt;

  if (Date.now() - updatedAt.getTime() > CACHE_TTL_MS) {
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

  await execute(
    "INSERT INTO CreatorsCache (site, data, updatedAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = ?, updatedAt = ?",
    [site, jsonData, now, jsonData, now]
  );
}
