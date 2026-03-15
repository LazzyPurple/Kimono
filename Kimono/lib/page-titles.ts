export function buildAppPageTitle(section: string | null | undefined): string {
  const normalized = section?.trim();
  return normalized ? `${normalized} | Kimono` : "Kimono";
}

export function buildSearchPageTitle(): string {
  return buildAppPageTitle("Search");
}

export function buildCreatorPageTitle(
  creatorName: string | null | undefined,
  service: string | null | undefined
): string {
  const fallbackName = creatorName?.trim() || "Creator";
  const fallbackService = service?.trim() || "Unknown";
  return `${fallbackName} | ${fallbackService}`;
}

export function buildPostPageTitle(
  creatorName: string | null | undefined,
  service: string | null | undefined
): string {
  return buildCreatorPageTitle(creatorName, service);
}
