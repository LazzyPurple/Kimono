import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getCurrentDiagnosticAccessDecision } from "@/lib/diagnostic-access";

export type SearchParamValue = string | string[] | undefined;
export type SearchParamRecord = Record<string, SearchParamValue>;

export function firstSearchParam(value: SearchParamValue): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function toUrlSearchParams(record: SearchParamRecord = {}): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") {
          params.append(key, item);
        }
      }
      continue;
    }

    if (value != null && value !== "") {
      params.set(key, value);
    }
  }

  return params;
}

export function buildPathWithParams(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export async function requireAdminPageAccess(pathname: string, resolvedParams: SearchParamRecord = {}) {
  const requestHeaders = await headers();
  const allParams = toUrlSearchParams(resolvedParams);
  const debugToken = firstSearchParam(resolvedParams.debugToken);
  const currentUrl = `http://localhost${buildPathWithParams(pathname, allParams)}`;
  const accessDecision = await getCurrentDiagnosticAccessDecision({
    headers: requestHeaders,
    url: currentUrl,
  });

  if (accessDecision.type !== "allowed") {
    if (debugToken) {
      notFound();
    }

    const callbackParams = new URLSearchParams(allParams);
    callbackParams.delete("debugToken");
    redirect(`/login?callbackUrl=${encodeURIComponent(buildPathWithParams(pathname, callbackParams))}`);
  }

  return {
    debugToken,
    allParams,
    currentUrl,
  };
}

export async function isAdminApiAuthorized(request: Request): Promise<boolean> {
  const decision = await getCurrentDiagnosticAccessDecision({
    headers: request.headers,
    url: request.url,
  });

  return decision.type === "allowed";
}
