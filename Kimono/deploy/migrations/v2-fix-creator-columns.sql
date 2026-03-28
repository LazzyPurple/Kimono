-- Align Creator timestamp naming after v2 transition.
ALTER TABLE `Creator`
  ADD COLUMN IF NOT EXISTS `indexedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `updatedAt` DATETIME(3) NULL;

UPDATE `Creator`
SET
  `indexedAt` = COALESCE(`indexedAt`, FROM_UNIXTIME(`indexed`)),
  `updatedAt` = COALESCE(`updatedAt`, FROM_UNIXTIME(`updated`))
WHERE `indexedAt` IS NULL OR `updatedAt` IS NULL;

SELECT 'Creator timestamp columns aligned.' AS status;
