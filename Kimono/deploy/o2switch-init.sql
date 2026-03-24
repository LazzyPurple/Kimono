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
    longestVideoUrl TEXT NULL,
    longestVideoDurationSeconds DOUBLE NULL,
    previewThumbnailAssetPath TEXT NULL,
    previewClipAssetPath TEXT NULL,
    previewStatus VARCHAR(64) NULL,
    previewGeneratedAt DATETIME (3) NULL,
    previewError LONGTEXT NULL,
    previewSourceFingerprint VARCHAR(191) NULL,
    cachedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME (3) NOT NULL,
    PRIMARY KEY (site, service, creatorId, postId),
    KEY `PostCache_creator_idx` (site, service, creatorId, publishedAt),
    KEY `PostCache_expiresAt_idx` (expiresAt),
    KEY `PostCache_previewSourceFingerprint_idx` (site, previewSourceFingerprint)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `PreviewAssetCache` (
    site VARCHAR(32) NOT NULL,
    sourceVideoUrl TEXT NOT NULL,
    sourceFingerprint VARCHAR(191) NOT NULL,
    durationSeconds DOUBLE NULL,
    thumbnailAssetPath TEXT NULL,
    clipAssetPath TEXT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'pending',
    generatedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lastSeenAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    error LONGTEXT NULL,
    PRIMARY KEY (site, sourceFingerprint),
    KEY `PreviewAssetCache_lastSeenAt_idx` (lastSeenAt)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `MediaSourceCache` (
    site VARCHAR(32) NOT NULL,
    sourceVideoUrl TEXT NOT NULL,
    sourceFingerprint VARCHAR(191) NOT NULL,
    localVideoPath TEXT NULL,
    downloadStatus VARCHAR(64) NOT NULL DEFAULT 'pending',
    downloadedAt DATETIME (3) NULL,
    lastSeenAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    retentionUntil DATETIME (3) NULL,
    fileSizeBytes BIGINT NULL,
    mimeType VARCHAR(191) NULL,
    downloadError LONGTEXT NULL,
    downloadAttempts INT NULL,
    lastObservedContext VARCHAR(191) NULL,
    priorityClass VARCHAR(32) NULL,
    retryAfter DATETIME (3) NULL,
    firstSeenAt DATETIME (3) NULL,
    PRIMARY KEY (site, sourceFingerprint),
    KEY `MediaSourceCache_lastSeenAt_idx` (lastSeenAt),
    KEY `MediaSourceCache_retentionUntil_idx` (retentionUntil),
    KEY `MediaSourceCache_priorityClass_idx` (priorityClass)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `CreatorSearchCache` (
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    normalizedQuery VARCHAR(255) NOT NULL DEFAULT '',
    media VARCHAR(32) NOT NULL DEFAULT 'all',
    page INT NOT NULL,
    perPage INT NOT NULL,
    payloadJson LONGTEXT NOT NULL,
    cachedAt DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME (3) NOT NULL,
    PRIMARY KEY (site, service, creatorId, normalizedQuery, media, page, perPage),
    KEY `CreatorSearchCache_expiresAt_idx` (expiresAt)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS PopularSnapshot (
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
    KEY `PopularSnapshot_lookup_idx` (site, period, rangeKey, pageOffset, syncedAt),
    KEY `PopularSnapshot_snapshotDate_idx` (snapshotDate)
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
