# Creator Search Implementation Plan

## Goal

Replace creator-page local snapshot search/filtering with a server-driven filtered search endpoint that provides faithful pagination and caches results for 3 days.

## Phase 1 - Add dedicated filtered-search cache storage

- Extend the perf repository schema with a dedicated `CreatorSearchCache` store.
- Add CRUD helpers to:
  - read fresh cached search pages
  - read stale cached search pages
  - upsert cached page payloads
  - purge expired entries
- Use a key composed from `site`, `service`, `creatorId`, normalized `query`, `media`, `page`, and `perPage`.
- Add tests for repository read/write/expiry behavior.

## Phase 2 - Build the filtered creator-search service

- Add a service in `Kimono/lib/hybrid-content.ts` or a dedicated helper module to:
  - normalize request parameters
  - fetch creator posts from upstream page by page
  - pass `q` upstream when available
  - filter by `media` server-side
  - accumulate enough results to resolve the requested page faithfully
  - stop after `10` upstream pages
  - compute `posts`, `total`, `hasNextPage`, `scannedPages`, `truncated`, `source`, and `cache`
- Reuse stale cache on upstream failure when available.
- Add focused tests for:
  - cache miss then cache hit
  - faithful `images` / `videos` pagination
  - `q + media`
  - stale fallback
  - truncation after the scan limit

## Phase 3 - Expose the new API endpoint

- Add `GET /api/creator-posts/search`.
- Validate query parameters and normalize defaults.
- Return structured JSON with cache metadata.
- Keep `/api/creator-posts` unchanged for the normal creator listing path.
- Add route tests for success, bad params, cache hit, stale cache, and truncated responses.

## Phase 4 - Switch the creator page to the new endpoint

- Update `Kimono/app/(protected)/creator/[site]/[service]/[id]/page.tsx` so:
  - unfiltered mode keeps the current route
  - `q` or `media != all` uses `/api/creator-posts/search`
- Remove the local-snapshot-only branching for filtered mode.
- Replace local snapshot wording with truthful API-backed result text.
- Add UI tests covering endpoint selection and result-state messaging.

## Phase 5 - Regression and verification

- Confirm normal creator feed behavior is unchanged without search/filter.
- Run `npm test`.
- Run `npm run build`.
- Manually smoke-check a creator page with:
  - query only
  - videos only
  - images only
  - query + videos

## Notes

- Do not reuse the existing snapshot cache as the main filtered-search source of truth.
- Keep the dedicated filtered-search cache TTL at `3 days`.
- Preserve room for future local indexing optimizations without changing the endpoint contract.
