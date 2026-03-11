import { execute } from "./db";

export async function initializeDatabase() {
  console.log("[DB] Initializing MySQL tables...");

  try {
    // User
    await execute(`
      CREATE TABLE IF NOT EXISTS User (
        id VARCHAR(191) PRIMARY KEY,
        email VARCHAR(191) UNIQUE NOT NULL,
        totpSecret VARCHAR(191) NULL,
        totpEnabled BOOLEAN NOT NULL DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Passkey
    await execute(`
      CREATE TABLE IF NOT EXISTS Passkey (
        id VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        credentialId VARCHAR(191) UNIQUE NOT NULL,
        publicKey TEXT NOT NULL,
        counter BIGINT NOT NULL,
        deviceName VARCHAR(191) NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Session (NextAuth)
    await execute(`
      CREATE TABLE IF NOT EXISTS Session (
        id VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        token VARCHAR(191) UNIQUE NOT NULL,
        expiresAt DATETIME(3) NOT NULL,
        FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // KimonoSession
    await execute(`
      CREATE TABLE IF NOT EXISTS KimonoSession (
        id VARCHAR(191) PRIMARY KEY,
        site VARCHAR(191) NOT NULL,
        cookie TEXT NOT NULL,
        username VARCHAR(191) NOT NULL,
        savedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // CreatorsCache
    await execute(`
      CREATE TABLE IF NOT EXISTS CreatorsCache (
        site VARCHAR(191) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updatedAt DATETIME(3) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // DiscoveryBlock
    await execute(`
      CREATE TABLE IF NOT EXISTS DiscoveryBlock (
        id VARCHAR(191) PRIMARY KEY,
        site VARCHAR(191) NOT NULL,
        service VARCHAR(191) NOT NULL,
        creatorId VARCHAR(191) NOT NULL,
        blockedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`DiscoveryBlock_site_service_creatorId_key\` (site, service, creatorId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // DiscoveryCache
    await execute(`
      CREATE TABLE IF NOT EXISTS DiscoveryCache (
        id VARCHAR(191) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("[DB] Initialization complete.");
  } catch (error) {
    console.error("[DB] Initialization failed:", error);
    throw error;
  }
}
