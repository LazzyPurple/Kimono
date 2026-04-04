CREATE INDEX IF NOT EXISTS creator_name_search_tsv_idx ON Creator USING GIN (
  to_tsvector('simple', regexp_replace(coalesce(name, '') || ' ' || coalesce(normalizedname, ''), '[_-]+', ' ', 'g'))
);

SELECT 'Creator full-text search index ready.' AS status;
