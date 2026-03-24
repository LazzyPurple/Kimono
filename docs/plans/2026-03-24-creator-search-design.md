# Creator Search And Media Filter Design

## Summary

The creator page search and media filters currently fall back to a local snapshot scope, which frequently returns incomplete or empty results even when the upstream creator feed contains matching posts. The goal of this design is to make creator-page search and `Images` / `Videos` filters API-driven with faithful pagination, while caching results for reuse.

This change applies only to the creator page filtered/search mode. The normal creator listing path remains unchanged when no query is present and the media filter is `all`.

## Goals

- Use server-side API search/filtering instead of local snapshot filtering on the creator page.
- Preserve faithful pagination for `q`, `media`, and `q + media`.
- Cache filtered search results for `3 days`.
- Keep upstream scan cost bounded to avoid pathological requests.
- Return explicit cache/source metadata so the UI can display truthful status text.

## Non-goals

- Replacing the existing unfiltered creator feed implementation.
- Reworking other pages that currently consume creator post data.
- Building a fully local indexed search engine as the primary source of truth.

## Recommended Approach

Use a dedicated filtered-search endpoint backed by a dedicated cached-result store.

The endpoint computes faithful filtered pages by scanning the upstream creator feed page by page, applying the query upstream when supported and applying media filters server-side. Once computed, the result payload for the requested page is cached for `3 days` so repeated searches are fast.

This intentionally does not reuse the existing snapshot scope as the primary source of truth for search/filter mode. Snapshot data can continue to exist for other internal uses, but not for creator-page filtered pagination.

## Alternatives Considered

### 1. Keep snapshot filtering and improve local warmup

- Lowest implementation effort.
- Still produces incomplete or stale results.
- Does not satisfy faithful pagination.

### 2. Live endpoint without cache

- Correct results on every request.
- Repeated searches stay expensive.
- Worse UX for users who revisit the same query/filter combination.

### 3. Full local indexing as primary source of truth

- Very fast once warm.
- Reintroduces staleness and cache completeness problems as the main failure mode.
- Better as a future optimization layer than as the primary fix.

## API Design

### Endpoint

`GET /api/creator-posts/search`

### Query parameters

- `site`
- `service`
- `id`
- `q`
- `media=all|images|videos`
- `page`
- `perPage`

### Response shape

```json
{
  "posts": [],
  "total": 0,
  "page": 1,
  "perPage": 50,
  "hasNextPage": false,
  "scannedPages": 0,
  "truncated": false,
  "source": "upstream",
  "cache": {
    "hit": false,
    "stale": false,
    "ttlSeconds": 259200
  }
}
```

### Semantics

- `source` indicates whether the response came from live upstream computation, fresh cache, or stale cache fallback.
- `truncated=true` indicates the upstream scan limit was reached before the server could fully determine the complete result space.
- `cache.ttlSeconds` reflects the dedicated cache retention of `3 days` (`259200` seconds).

## Server Data Flow

### Normalization

- Normalize `q` with trim + lowercase for cache-key purposes.
- Normalize `media` to `all | images | videos`.
- Bound `page` and `perPage` to safe values.

### Cache lookup

Before scanning upstream, the endpoint checks a dedicated filtered-search cache using a logical key composed from:

- `site`
- `service`
- `creatorId`
- normalized `query`
- normalized `media`
- `page`
- `perPage`

If a fresh entry exists, it is returned immediately.

### Upstream scan algorithm

On cache miss or cache expiry:

1. Call the upstream creator-posts API page by page.
2. Pass `q` upstream when present.
3. Apply `media` filtering server-side on each upstream page.
4. Accumulate matching posts until there is enough information to:
   - build the exact requested page
   - determine whether another page exists
5. Stop once the requested page is resolved or the scan limit is reached.

### Scan limit

- Hard limit: `10` upstream pages maximum per request.
- If the limit is reached before complete knowledge is available, return the current best page and set `truncated=true`.

### Cache population

After computing a response, store the full page payload in a dedicated cache with a TTL of `3 days`.

### Failure fallback

- If upstream fails and a stale cache entry exists, return the stale cached payload with `cache.stale=true`.
- If upstream fails and no cached entry exists, return a structured API error instead of silently pretending there are zero posts.

## Storage Design

Use a dedicated cache store for filtered creator search results rather than reusing the snapshot cache.

Suggested schema concept:

- `site`
- `service`
- `creatorId`
- `normalizedQuery`
- `media`
- `page`
- `perPage`
- `payloadJson`
- `createdAt`
- `expiresAt`

The cached payload is page-scoped to keep storage predictable and avoid materializing giant creator-wide result sets for every query.

## UI Integration

### Routing behavior

- If there is no query and `media=all`, keep using the existing `/api/creator-posts` flow.
- If `q` is present or `media != all`, use `/api/creator-posts/search`.

### UI text changes

Replace the current local-snapshot wording with truthful result-state messaging:

- `N posts found`
- `N posts found (cached)` on cache hit
- `Results may be incomplete` when `truncated=true`
- `No posts match this search` only when the API returns `total=0`

The UI should no longer mention `local snapshot` for creator-page search/filter mode.

## Error Handling

- Serve stale cache when possible if upstream is temporarily unavailable.
- Show a real user-facing error state if neither live upstream data nor stale cache is available.
- Do not collapse upstream failures into empty result sets.

## Testing Strategy

### Endpoint tests

- cache miss then cache hit
- `3 day` TTL behavior
- stale-cache fallback on upstream failure
- faithful pagination for `images` / `videos`
- `q + media` combined filtering
- `truncated=true` after `10` upstream pages

### UI tests

- creator page switches to the new endpoint when `q` is present
- creator page switches to the new endpoint when `media != all`
- local snapshot wording is removed
- result count and truncated messaging are correct

### Regression tests

- normal creator page without search/filter remains unchanged
- `npm test` stays green
- `npm run build` stays green

## Rollout Notes

- The filtered-search cache should not replace the existing snapshot store.
- The normal creator listing should stay on its current route to minimize regression surface.
- This design is compatible with future optimizations such as richer local indexing, but keeps upstream truth as the primary source today.
