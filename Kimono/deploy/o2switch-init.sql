CREATE TABLE
  IF NOT EXISTS `User` (
    id VARCHAR(191) PRIMARY KEY,
    email VARCHAR(191) UNIQUE NOT NULL,
    totpSecret VARCHAR(191) NULL,
    totpEnabled BOOLEAN NOT NULL DEFAULT 0,
    createdAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `Passkey` (
    id VARCHAR(191) PRIMARY KEY,
    userId VARCHAR(191) NOT NULL,
    credentialId VARCHAR(191) UNIQUE NOT NULL,
    publicKey TEXT NOT NULL,
    counter BIGINT NOT NULL,
    deviceName VARCHAR(191) NULL,
    createdAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (userId) REFERENCES `User` (id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `Session` (
    id VARCHAR(191) PRIMARY KEY,
    userId VARCHAR(191) NOT NULL,
    token VARCHAR(191) UNIQUE NOT NULL,
    expiresAt DATETIME (3) NOT NULL,
    FOREIGN KEY (userId) REFERENCES `User` (id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `KimonoSession` (
    id VARCHAR(191) PRIMARY KEY,
    site VARCHAR(191) NOT NULL,
    cookie TEXT NOT NULL,
    username VARCHAR(191) NOT NULL,
    savedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `CreatorsCache` (
    site VARCHAR(191) PRIMARY KEY,
    data LONGTEXT NOT NULL,
    updatedAt DATETIME (3) NOT NULL
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `CreatorIndex` (
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    name VARCHAR(191) NOT NULL,
    normalizedName VARCHAR(191) NOT NULL,
    favorited INT NOT NULL DEFAULT 0,
    updatedAt DATETIME (3) NULL,
    indexedAt DATETIME (3) NULL,
    profileImageUrl TEXT NULL,
    bannerImageUrl TEXT NULL,
    publicId VARCHAR(191) NULL,
    postCount INT NULL,
    rawPreviewPayload LONGTEXT NULL,
    syncedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (site, service, creatorId),
    KEY `CreatorIndex_normalizedName_idx` (normalizedName),
    KEY `CreatorIndex_site_syncedAt_idx` (site, syncedAt)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `PostCache` (
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    postId VARCHAR(191) NOT NULL,
    title TEXT NULL,
    excerpt LONGTEXT NULL,
    publishedAt DATETIME (3) NULL,
    addedAt DATETIME (3) NULL,
    editedAt DATETIME (3) NULL,
    previewImageUrl TEXT NULL,
    videoUrl TEXT NULL,
    thumbUrl TEXT NULL,
    mediaType VARCHAR(32) NULL,
    authorName VARCHAR(191) NULL,
    rawPreviewPayload LONGTEXT NULL,
    rawDetailPayload LONGTEXT NULL,
    detailLevel VARCHAR(32) NOT NULL DEFAULT 'metadata',
    sourceKind VARCHAR(64) NOT NULL DEFAULT 'live',
    cachedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME (3) NOT NULL,
    PRIMARY KEY (site, service, creatorId, postId),
    KEY `PostCache_creator_idx` (site, service, creatorId, publishedAt),
    KEY `PostCache_expiresAt_idx` (expiresAt)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `PopularSnapshot` (
    snapshotRunId VARCHAR(191) NOT NULL,
    rank INT NOT NULL,
    site VARCHAR(32) NOT NULL,
    period VARCHAR(32) NOT NULL,
    rangeKey VARCHAR(32) NOT NULL DEFAULT '',
    pageOffset INT NOT NULL DEFAULT 0,
    snapshotDate VARCHAR(32) NOT NULL,
    syncedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    postSite VARCHAR(32) NOT NULL,
    postService VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    postId VARCHAR(191) NOT NULL,
    PRIMARY KEY (snapshotRunId, rank),
    KEY `PopularSnapshot_lookup_idx` (site, period, rangeKey, pageOffset, syncedAt)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `DiscoveryBlock` (
    id VARCHAR(191) PRIMARY KEY,
    site VARCHAR(191) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    blockedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY `DiscoveryBlock_site_service_creatorId_key` (site, service, creatorId)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `DiscoveryCache` (
    id VARCHAR(191) PRIMARY KEY,
    data LONGTEXT NOT NULL,
    updatedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;