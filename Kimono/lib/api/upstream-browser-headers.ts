export type UpstreamBrowserSite = "kemono" | "coomer";

const SITE_ORIGINS: Record<UpstreamBrowserSite, string> = {
  kemono: "https://kemono.cr",
  coomer: "https://coomer.st",
};

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function getUpstreamOrigin(site: UpstreamBrowserSite): string {
  return SITE_ORIGINS[site];
}

export function createUpstreamBrowserHeaders(site: UpstreamBrowserSite, cookie?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "text/css",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": BROWSER_USER_AGENT,
    Referer: `${SITE_ORIGINS[site]}/`,
  };

  if (cookie && cookie.trim()) {
    headers.Cookie = cookie.trim();
  }

  return headers;
}

