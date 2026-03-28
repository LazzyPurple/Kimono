ALTER TABLE `FavoriteChronology`
  ADD COLUMN IF NOT EXISTS `favedSeq` BIGINT NULL,
  ADD KEY IF NOT EXISTS `FavoriteChronology_favedSeq_idx` (`favedSeq`);
SELECT 'FavoriteChronology updated.' AS status;
