-- ============================================
-- Kimono DB v2 reconstruction (PostgreSQL)
-- Preserve auth tables: "User", "Passkey", "Session"
-- ============================================

BEGIN;

DROP TABLE IF EXISTS CreatorsCache CASCADE;
DROP TABLE IF EXISTS CreatorIndex CASCADE;
DROP TABLE IF EXISTS PostCache CASCADE;
DROP TABLE IF EXISTS PopularSnapshot CASCADE;
DROP TABLE IF EXISTS CreatorSnapshot CASCADE;
DROP TABLE IF EXISTS CreatorSearchCache CASCADE;
DROP TABLE IF EXISTS FavoriteSnapshot CASCADE;
DROP TABLE IF EXISTS PreviewAssetCache CASCADE;
DROP TABLE IF EXISTS MediaSourceCache CASCADE;

DROP TABLE IF EXISTS KimonoSession CASCADE;
DROP TABLE IF EXISTS Creator CASCADE;
DROP TABLE IF EXISTS Post CASCADE;
DROP TABLE IF EXISTS FavoriteChronology CASCADE;
DROP TABLE IF EXISTS FavoriteCache CASCADE;
DROP TABLE IF EXISTS MediaAsset CASCADE;
DROP TABLE IF EXISTS MediaSource CASCADE;
DROP TABLE IF EXISTS DiscoveryCache CASCADE;
DROP TABLE IF EXISTS DiscoveryBlock CASCADE;

CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  totpsecret TEXT NULL,
  totpenabled INTEGER NOT NULL DEFAULT 0,
  createdat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Passkey" (
  id TEXT PRIMARY KEY,
  userid TEXT NOT NULL,
  credentialid TEXT UNIQUE NOT NULL,
  publickey TEXT NOT NULL,
  counter BIGINT NOT NULL,
  devicename TEXT NULL,
  createdat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userid) REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Session" (
  id TEXT PRIMARY KEY,
  userid TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expiresat TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (userid) REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS KimonoSession (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL UNIQUE,
  cookie TEXT NOT NULL,
  username TEXT NOT NULL,
  savedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS kimonosession_savedat_idx ON KimonoSession (savedat);

CREATE TABLE IF NOT EXISTS Creator (
  site TEXT NOT NULL,
  service TEXT NOT NULL,
  creatorid TEXT NOT NULL,
  name TEXT NOT NULL,
  normalizedname TEXT NOT NULL,
  indexed BIGINT NULL,
  updated BIGINT NULL,
  favorited INTEGER NOT NULL DEFAULT 0,
  postcount INTEGER NOT NULL DEFAULT 0,
  publicid TEXT NULL,
  relationid BIGINT NULL,
  dmcount INTEGER NOT NULL DEFAULT 0,
  sharecount INTEGER NOT NULL DEFAULT 0,
  haschats INTEGER NOT NULL DEFAULT 0,
  chatcount INTEGER NOT NULL DEFAULT 0,
  profileimageurl TEXT NULL,
  bannerimageurl TEXT NULL,
  rawindexpayload TEXT NULL,
  rawprofilepayload TEXT NULL,
  catalogsyncedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  profilecachedat TIMESTAMPTZ NULL,
  profileexpiresat TIMESTAMPTZ NULL,
  archivedat TIMESTAMPTZ NULL,
  PRIMARY KEY (site, service, creatorid)
);

CREATE INDEX IF NOT EXISTS creator_normalizedname_idx ON Creator (normalizedname);
CREATE INDEX IF NOT EXISTS creator_site_service_favorited_idx ON Creator (site, service, favorited);
CREATE INDEX IF NOT EXISTS creator_site_service_updated_idx ON Creator (site, service, updated);
CREATE INDEX IF NOT EXISTS creator_catalogsyncedat_idx ON Creator (catalogsyncedat);
CREATE INDEX IF NOT EXISTS creator_profileexpiresat_idx ON Creator (profileexpiresat);

CREATE TABLE IF NOT EXISTS Post (
  site TEXT NOT NULL,
  service TEXT NOT NULL,
  creatorid TEXT NOT NULL,
  postid TEXT NOT NULL,
  title TEXT NULL,
  contenthtml TEXT NULL,
  excerpt TEXT NULL,
  publishedat TIMESTAMPTZ NULL,
  addedat TIMESTAMPTZ NULL,
  editedat TIMESTAMPTZ NULL,
  filename TEXT NULL,
  filepath TEXT NULL,
  attachmentsjson TEXT NULL,
  embedjson TEXT NULL,
  tagsjson TEXT NULL,
  prevpostid TEXT NULL,
  nextpostid TEXT NULL,
  favcount INTEGER NOT NULL DEFAULT 0,
  previewimageurl TEXT NULL,
  videourl TEXT NULL,
  thumburl TEXT NULL,
  mediatype TEXT NULL,
  authorname TEXT NULL,
  rawpreviewpayload TEXT NULL,
  rawdetailpayload TEXT NULL,
  detaillevel TEXT NOT NULL DEFAULT 'preview',
  sourcekind TEXT NOT NULL DEFAULT 'upstream',
  ispopular INTEGER NOT NULL DEFAULT 0,
  primarypopularperiod TEXT NULL,
  primarypopulardate TEXT NULL,
  primarypopularoffset INTEGER NULL,
  primarypopularrank INTEGER NULL,
  popularcontextsjson TEXT NULL,
  longestvideourl TEXT NULL,
  longestvideodurationseconds DOUBLE PRECISION NULL,
  previewstatus TEXT NULL,
  nativethumbnailurl TEXT NULL,
  previewthumbnailassetpath TEXT NULL,
  previewclipassetpath TEXT NULL,
  previewgeneratedat TIMESTAMPTZ NULL,
  previewerror TEXT NULL,
  previewsourcefingerprint TEXT NULL,
  mediamimetype TEXT NULL,
  mediawidth INTEGER NULL,
  mediaheight INTEGER NULL,
  cachedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresat TIMESTAMPTZ NOT NULL,
  staleuntil TIMESTAMPTZ NULL,
  lastseenat TIMESTAMPTZ NULL,
  PRIMARY KEY (site, service, creatorid, postid)
);

CREATE INDEX IF NOT EXISTS post_creator_published_idx ON Post (site, service, creatorid, publishedat DESC);
CREATE INDEX IF NOT EXISTS post_expiresat_idx ON Post (expiresat);
CREATE INDEX IF NOT EXISTS post_previewsourcefingerprint_idx ON Post (site, previewsourcefingerprint);
CREATE INDEX IF NOT EXISTS post_popular_lookup_idx ON Post (site, ispopular, primarypopularperiod, primarypopulardate, primarypopularoffset, primarypopularrank);
CREATE INDEX IF NOT EXISTS post_lastseenat_idx ON Post (lastseenat);

CREATE TABLE IF NOT EXISTS FavoriteChronology (
  kind TEXT NOT NULL,
  site TEXT NOT NULL,
  service TEXT NOT NULL,
  creatorid TEXT NOT NULL,
  postid TEXT NOT NULL DEFAULT '',
  favoritedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastconfirmedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  favedseq BIGINT NULL,
  PRIMARY KEY (kind, site, service, creatorid, postid)
);

CREATE INDEX IF NOT EXISTS favoritechronology_lastconfirmedat_idx ON FavoriteChronology (lastconfirmedat);
CREATE INDEX IF NOT EXISTS favoritechronology_kind_site_favoritedat_idx ON FavoriteChronology (kind, site, favoritedat DESC);
CREATE INDEX IF NOT EXISTS favoritechronology_favedseq_idx ON FavoriteChronology (favedseq DESC);

CREATE TABLE IF NOT EXISTS FavoriteCache (
  kind TEXT NOT NULL,
  site TEXT NOT NULL,
  payloadjson TEXT NOT NULL,
  updatedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresat TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (kind, site)
);

CREATE INDEX IF NOT EXISTS favoritecache_expiresat_idx ON FavoriteCache (expiresat);

CREATE TABLE IF NOT EXISTS MediaAsset (
  site TEXT NOT NULL,
  sourcefingerprint TEXT NOT NULL,
  sourceurl TEXT NOT NULL,
  sourcepath TEXT NULL,
  mediakind TEXT NULL,
  mimetype TEXT NULL,
  width INTEGER NULL,
  height INTEGER NULL,
  durationseconds DOUBLE PRECISION NULL,
  nativethumbnailurl TEXT NULL,
  thumbnailassetpath TEXT NULL,
  clipassetpath TEXT NULL,
  probestatus TEXT NOT NULL DEFAULT 'pending',
  previewstatus TEXT NOT NULL DEFAULT 'pending',
  firstseenat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastseenat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hotuntil TIMESTAMPTZ NULL,
  retryafter TIMESTAMPTZ NULL,
  generationattempts INTEGER NOT NULL DEFAULT 0,
  lasterror TEXT NULL,
  lastobservedcontext TEXT NULL,
  cachedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresat TIMESTAMPTZ NULL,
  PRIMARY KEY (site, sourcefingerprint)
);

CREATE INDEX IF NOT EXISTS mediaasset_lastseenat_idx ON MediaAsset (lastseenat);
CREATE INDEX IF NOT EXISTS mediaasset_hotuntil_idx ON MediaAsset (hotuntil);
CREATE INDEX IF NOT EXISTS mediaasset_retryafter_idx ON MediaAsset (retryafter);
CREATE INDEX IF NOT EXISTS mediaasset_expiresat_idx ON MediaAsset (expiresat);

CREATE TABLE IF NOT EXISTS MediaSource (
  site TEXT NOT NULL,
  sourcefingerprint TEXT NOT NULL,
  sourceurl TEXT NOT NULL,
  sourcepath TEXT NULL,
  localpath TEXT NULL,
  downloadstatus TEXT NOT NULL DEFAULT 'pending',
  downloadedat TIMESTAMPTZ NULL,
  lastseenat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retentionuntil TIMESTAMPTZ NULL,
  filesizebytes BIGINT NULL,
  mimetype TEXT NULL,
  downloaderror TEXT NULL,
  downloadattempts INTEGER NOT NULL DEFAULT 0,
  lastobservedcontext TEXT NULL,
  priorityclass TEXT NULL,
  retryafter TIMESTAMPTZ NULL,
  firstseenat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site, sourcefingerprint)
);

CREATE INDEX IF NOT EXISTS mediasource_lastseenat_idx ON MediaSource (lastseenat);
CREATE INDEX IF NOT EXISTS mediasource_retentionuntil_idx ON MediaSource (retentionuntil);
CREATE INDEX IF NOT EXISTS mediasource_priorityclass_idx ON MediaSource (priorityclass);
CREATE INDEX IF NOT EXISTS mediasource_retryafter_idx ON MediaSource (retryafter);

CREATE TABLE IF NOT EXISTS DiscoveryCache (
  site TEXT PRIMARY KEY,
  payloadjson TEXT NOT NULL,
  updatedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresat TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS discoverycache_expiresat_idx ON DiscoveryCache (expiresat);

CREATE TABLE IF NOT EXISTS DiscoveryBlock (
  site TEXT NOT NULL,
  service TEXT NOT NULL,
  creatorid TEXT NOT NULL,
  blockedat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site, service, creatorid)
);

CREATE INDEX IF NOT EXISTS discoveryblock_blockedat_idx ON DiscoveryBlock (blockedat);

COMMIT;
