-- ============================================
-- Kimono DB v2 reconstruction
-- Preserve auth tables: User, Passkey, Session
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `CreatorsCache`;
DROP TABLE IF EXISTS `CreatorIndex`;
DROP TABLE IF EXISTS `PostCache`;
DROP TABLE IF EXISTS `PopularSnapshot`;
DROP TABLE IF EXISTS `CreatorSnapshot`;
DROP TABLE IF EXISTS `CreatorSearchCache`;
DROP TABLE IF EXISTS `FavoriteSnapshot`;
DROP TABLE IF EXISTS `PreviewAssetCache`;
DROP TABLE IF EXISTS `MediaSourceCache`;
DROP TABLE IF EXISTS `KimonoSession`;
DROP TABLE IF EXISTS `DiscoveryCache`;
DROP TABLE IF EXISTS `DiscoveryBlock`;
DROP TABLE IF EXISTS `Creator`;
DROP TABLE IF EXISTS `Post`;
DROP TABLE IF EXISTS `FavoriteChronology`;
DROP TABLE IF EXISTS `FavoriteCache`;
DROP TABLE IF EXISTS `MediaAsset`;
DROP TABLE IF EXISTS `MediaSource`;

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================
-- Kimono bootstrap schema (MySQL)
-- Source de verite du schema prod
-- ============================================

CREATE TABLE
  IF NOT EXISTS `User` (
    id VARCHAR(191) PRIMARY KEY,
    email VARCHAR(191) UNIQUE NOT NULL,
    totpSecret VARCHAR(191) NULL,
    totpEnabled BOOLEAN NOT NULL DEFAULT 0,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `Passkey` (
    id VARCHAR(191) PRIMARY KEY,
    userId VARCHAR(191) NOT NULL,
    credentialId VARCHAR(191) UNIQUE NOT NULL,
    publicKey TEXT NOT NULL,
    counter BIGINT NOT NULL,
    deviceName VARCHAR(191) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (userId) REFERENCES `User` (id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `Session` (
    id VARCHAR(191) PRIMARY KEY,
    userId VARCHAR(191) NOT NULL,
    token VARCHAR(191) UNIQUE NOT NULL,
    expiresAt DATETIME(3) NOT NULL,
    FOREIGN KEY (userId) REFERENCES `User` (id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `KimonoSession` (
    id VARCHAR(191) PRIMARY KEY,
    site VARCHAR(32) NOT NULL,
    cookie LONGTEXT NOT NULL,
    username VARCHAR(191) NOT NULL,
    savedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY `KimonoSession_site_key` (site),
    KEY `KimonoSession_savedAt_idx` (savedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `Creator` (
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    name VARCHAR(191) NOT NULL,
    normalizedName VARCHAR(191) NOT NULL,
    indexed BIGINT NULL,
    updated BIGINT NULL,
    favorited INT NOT NULL DEFAULT 0,
    postCount INT NOT NULL DEFAULT 0,
    publicId VARCHAR(191) NULL,
    relationId BIGINT NULL,
    dmCount INT NOT NULL DEFAULT 0,
    shareCount INT NOT NULL DEFAULT 0,
    hasChats BOOLEAN NOT NULL DEFAULT 0,
    chatCount INT NOT NULL DEFAULT 0,
    profileImageUrl TEXT NULL,
    bannerImageUrl TEXT NULL,
    rawIndexPayload LONGTEXT NULL,
    rawProfilePayload LONGTEXT NULL,
    catalogSyncedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    profileCachedAt DATETIME(3) NULL,
    profileExpiresAt DATETIME(3) NULL,
    archivedAt DATETIME(3) NULL,
    PRIMARY KEY (site, service, creatorId),
    KEY `Creator_normalizedName_idx` (normalizedName),
    KEY `Creator_site_service_favorited_idx` (site, service, favorited),
    KEY `Creator_site_service_updated_idx` (site, service, updated),
    KEY `Creator_catalogSyncedAt_idx` (catalogSyncedAt),
    KEY `Creator_profileExpiresAt_idx` (profileExpiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `Post` (
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    postId VARCHAR(191) NOT NULL,
    title TEXT NULL,
    contentHtml LONGTEXT NULL,
    excerpt LONGTEXT NULL,
    publishedAt DATETIME(3) NULL,
    addedAt DATETIME(3) NULL,
    editedAt DATETIME(3) NULL,
    fileName VARCHAR(191) NULL,
    filePath TEXT NULL,
    attachmentsJson LONGTEXT NULL,
    embedJson LONGTEXT NULL,
    tagsJson LONGTEXT NULL,
    prevPostId VARCHAR(191) NULL,
    nextPostId VARCHAR(191) NULL,
    favCount INT NOT NULL DEFAULT 0,
    previewImageUrl TEXT NULL,
    videoUrl TEXT NULL,
    thumbUrl TEXT NULL,
    mediaType VARCHAR(64) NULL,
    authorName VARCHAR(191) NULL,
    rawPreviewPayload LONGTEXT NULL,
    rawDetailPayload LONGTEXT NULL,
    detailLevel VARCHAR(32) NOT NULL DEFAULT 'preview',
    sourceKind VARCHAR(32) NOT NULL DEFAULT 'upstream',
    isPopular BOOLEAN NOT NULL DEFAULT 0,
    primaryPopularPeriod VARCHAR(32) NULL,
    primaryPopularDate VARCHAR(32) NULL,
    primaryPopularOffset INT NULL,
    primaryPopularRank INT NULL,
    popularContextsJson LONGTEXT NULL,
    longestVideoUrl TEXT NULL,
    longestVideoDurationSeconds DOUBLE NULL,
    previewStatus VARCHAR(64) NULL,
    nativeThumbnailUrl TEXT NULL,
    previewThumbnailAssetPath TEXT NULL,
    previewClipAssetPath TEXT NULL,
    previewGeneratedAt DATETIME(3) NULL,
    previewError LONGTEXT NULL,
    previewSourceFingerprint VARCHAR(191) NULL,
    mediaMimeType VARCHAR(191) NULL,
    mediaWidth INT NULL,
    mediaHeight INT NULL,
    cachedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME(3) NOT NULL,
    staleUntil DATETIME(3) NULL,
    lastSeenAt DATETIME(3) NULL,
    PRIMARY KEY (site, service, creatorId, postId),
    KEY `Post_creator_published_idx` (site, service, creatorId, publishedAt),
    KEY `Post_expiresAt_idx` (expiresAt),
    KEY `Post_previewSourceFingerprint_idx` (site, previewSourceFingerprint),
    KEY `Post_popular_lookup_idx` (site, isPopular, primaryPopularPeriod, primaryPopularDate, primaryPopularOffset, primaryPopularRank),
    KEY `Post_lastSeenAt_idx` (lastSeenAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `FavoriteChronology` (
    kind VARCHAR(32) NOT NULL,
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    postId VARCHAR(191) NOT NULL DEFAULT '',
    favoritedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lastConfirmedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (kind, site, service, creatorId, postId),
    KEY `FavoriteChronology_lastConfirmedAt_idx` (lastConfirmedAt),
    KEY `FavoriteChronology_kind_site_favoritedAt_idx` (kind, site, favoritedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `FavoriteCache` (
    kind VARCHAR(32) NOT NULL,
    site VARCHAR(32) NOT NULL,
    payloadJson LONGTEXT NOT NULL,
    updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME(3) NOT NULL,
    PRIMARY KEY (kind, site),
    KEY `FavoriteCache_expiresAt_idx` (expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `MediaAsset` (
    site VARCHAR(32) NOT NULL,
    sourceFingerprint VARCHAR(191) NOT NULL,
    sourceUrl TEXT NOT NULL,
    sourcePath TEXT NULL,
    mediaKind VARCHAR(32) NULL,
    mimeType VARCHAR(191) NULL,
    width INT NULL,
    height INT NULL,
    durationSeconds DOUBLE NULL,
    nativeThumbnailUrl TEXT NULL,
    thumbnailAssetPath TEXT NULL,
    clipAssetPath TEXT NULL,
    probeStatus VARCHAR(64) NOT NULL DEFAULT 'pending',
    previewStatus VARCHAR(64) NOT NULL DEFAULT 'pending',
    firstSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lastSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    hotUntil DATETIME(3) NULL,
    retryAfter DATETIME(3) NULL,
    generationAttempts INT NOT NULL DEFAULT 0,
    lastError LONGTEXT NULL,
    lastObservedContext VARCHAR(191) NULL,
    cachedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME(3) NULL,
    PRIMARY KEY (site, sourceFingerprint),
    KEY `MediaAsset_lastSeenAt_idx` (lastSeenAt),
    KEY `MediaAsset_hotUntil_idx` (hotUntil),
    KEY `MediaAsset_retryAfter_idx` (retryAfter),
    KEY `MediaAsset_expiresAt_idx` (expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `MediaSource` (
    site VARCHAR(32) NOT NULL,
    sourceFingerprint VARCHAR(191) NOT NULL,
    sourceUrl TEXT NOT NULL,
    sourcePath TEXT NULL,
    localPath TEXT NULL,
    downloadStatus VARCHAR(64) NOT NULL DEFAULT 'pending',
    downloadedAt DATETIME(3) NULL,
    lastSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    retentionUntil DATETIME(3) NULL,
    fileSizeBytes BIGINT NULL,
    mimeType VARCHAR(191) NULL,
    downloadError LONGTEXT NULL,
    downloadAttempts INT NOT NULL DEFAULT 0,
    lastObservedContext VARCHAR(191) NULL,
    priorityClass VARCHAR(32) NULL,
    retryAfter DATETIME(3) NULL,
    firstSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (site, sourceFingerprint),
    KEY `MediaSource_lastSeenAt_idx` (lastSeenAt),
    KEY `MediaSource_retentionUntil_idx` (retentionUntil),
    KEY `MediaSource_priorityClass_idx` (priorityClass),
    KEY `MediaSource_retryAfter_idx` (retryAfter)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `DiscoveryCache` (
    site VARCHAR(32) PRIMARY KEY,
    payloadJson LONGTEXT NOT NULL,
    updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expiresAt DATETIME(3) NOT NULL,
    KEY `DiscoveryCache_expiresAt_idx` (expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE
  IF NOT EXISTS `DiscoveryBlock` (
    site VARCHAR(32) NOT NULL,
    service VARCHAR(191) NOT NULL,
    creatorId VARCHAR(191) NOT NULL,
    blockedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (site, service, creatorId),
    KEY `DiscoveryBlock_blockedAt_idx` (blockedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

