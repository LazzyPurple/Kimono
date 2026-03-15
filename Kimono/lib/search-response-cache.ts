export function shouldCacheSearchResponse(
  value: { source?: string | null } | null | undefined
): boolean {
  return value?.source !== "stale-cache";
}
