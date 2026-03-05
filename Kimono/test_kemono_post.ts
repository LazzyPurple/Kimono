import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:prisma/dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const session = await prisma.kimonoSession.findFirst({
    where: { site: "kemono" },
    orderBy: { savedAt: "desc" },
  });

  const cookie = session!.cookie;

  try {
    // Exactly what app/api/likes/posts/route.ts does
    const url = "https://kemono.cr/api/v1/favorites/post/fanbox/7143528";
    console.log("POSTing to", url);
    await axios.post(url, null, {
      headers: { Cookie: cookie, Accept: "application/json" }
    });
    console.log("Success");
  } catch (err: any) {
    console.error("Kemono API error:", err.response?.status, err.response?.data);
  }
}

main().finally(() => prisma.$disconnect());
