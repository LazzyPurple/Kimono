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

  if (!session) {
    console.log("No kemono session found in DB");
    return;
  }

  const cookie = session.cookie;

  try {
    console.log("Fetching artists...");
    const resArtists = await axios.get(
      "https://kemono.cr/api/v1/account/favorites?type=artist",
      {
        headers: { Cookie: cookie, Accept: "application/json" },
      }
    );
    console.log("Artists:", resArtists.data.slice(0, 2));

    console.log("Fetching posts...");
    const resPosts = await axios.get(
      "https://kemono.cr/api/v1/account/favorites?type=post",
      {
        headers: { Cookie: cookie, Accept: "application/json" },
      }
    );
    console.log("Posts:", resPosts.data.slice(0, 2));
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main().finally(() => prisma.$disconnect());
