import {
  createRateLimitError,
  getGlobalUpstreamRateGuard,
  resolveUpstreamBucket,
  type UpstreamBucket,
  type UpstreamSite,
} from "./upstream-rate-guard.ts";
import { createUpstreamBrowserHeaders } from "./upstream-browser-headers.ts";

export interface UpstreamFetchErrorOptions {
  site: UpstreamSite;
  url: string;
  status?: number | null;
  body?: string | null;
  headers?: Headers | null;
  cause?: unknown;
}

export class UpstreamFetchError extends Error {
  site: UpstreamSite;
  url: string;
  status: number | null;
  body: string | null;
  headers: Headers | null;

  constructor(message: string, options: UpstreamFetchErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "UpstreamFetchError";
    this.site = options.site;
    this.url = options.url;
    this.status = options.status ?? null;
    this.body = options.body ?? null;
    this.headers = options.headers ?? null;
  }
}

export interface FetchUpstreamResponseInput {
  site: UpstreamSite;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  cookie?: string | null;
  body?: BodyInit | null;
  timeoutMs?: number;
  retries?: number;
  retryDelaysMs?: number[];
  allowHttpErrors?: boolean;
  rateGuardBucket?: UpstreamBucket;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000];

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

function isAuthOrRateLimitStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}

function toHeaderRecord(headers: Headers): Record<string, string | number | null | undefined> {
  const record: Record<string, string | number | null | undefined> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function readErrorBody(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function fetchUpstreamResponse(input: FetchUpstreamResponseInput): Promise<Response> {
  const retryDelaysMs = input.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const retries = input.retries ?? retryDelaysMs.length;
  const bucket = input.rateGuardBucket ?? resolveUpstreamBucket(input.url);
  const rateGuard = getGlobalUpstreamRateGuard();

  const decision = rateGuard.canRequest(input.site, bucket);
  if (!decision.allowed) {
    throw createRateLimitError(input.site, decision.retryAfterMs, bucket);
  }

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input.url, {
        method: input.method ?? "GET",
        headers: {
          ...createUpstreamBrowserHeaders(input.site, input.cookie),
          ...input.headers,
        },
        body: input.body ?? null,
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfterMs = rateGuard.registerRateLimit(input.site, {
          status: 429,
          headers: toHeaderRecord(response.headers),
        }, bucket);
        const body = await readErrorBody(response);
        throw new UpstreamFetchError(
          `Upstream ${input.site} responded with 429 (${retryAfterMs}ms cooldown)`,
          { site: input.site, url: input.url, status: response.status, body, headers: response.headers }
        );
      }

      if (!response.ok && !input.allowHttpErrors) {
        const body = await readErrorBody(response);
        throw new UpstreamFetchError(`Upstream ${input.site} responded with ${response.status}`, {
          site: input.site,
          url: input.url,
          status: response.status,
          body,
          headers: response.headers,
        });
      }

      return response;
    } catch (error) {
      const maybeError = error as UpstreamFetchError & { name?: string; status?: number | null };
      const status = maybeError?.status ?? null;
      const isAbort = maybeError?.name === "AbortError";
      const shouldRetry = !isAbort
        && attempt < retries
        && ((status != null && isRetryableStatus(status) && !isAuthOrRateLimitStatus(status))
          || (status == null && !(error instanceof UpstreamFetchError)));

      if (!shouldRetry) {
        if (error instanceof UpstreamFetchError) {
          throw error;
        }

        const message = isAbort
          ? `Upstream ${input.site} request timed out`
          : `Upstream ${input.site} request failed`;
        throw new UpstreamFetchError(message, {
          site: input.site,
          url: input.url,
          cause: error,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? 0));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchUpstreamJson<T>(input: FetchUpstreamResponseInput): Promise<T> {
  const response = await fetchUpstreamResponse(input);
  return response.json() as Promise<T>;
}

export async function fetchUpstreamText(input: FetchUpstreamResponseInput): Promise<string> {
  const response = await fetchUpstreamResponse(input);
  return response.text();
}
