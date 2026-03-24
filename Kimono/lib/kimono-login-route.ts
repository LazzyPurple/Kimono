import axios from "axios";
import { getDataStore, type SupportedSite } from "./data-store.ts";
import { createUpstreamRateGuard, getGlobalUpstreamRateGuard } from "./api/upstream-rate-guard.ts";

export interface KimonoLoginResult {
  status: number;
  body: {
    success?: boolean;
    error?: string;
    retryAfterMs?: number;
  };
  headers?: Record<string, string>;
}

interface LoginResponse {
  status: number;
  data?: { error?: string } | null;
  headers?: Record<string, string | string[] | undefined>;
}

interface ProcessKimonoLoginInput {
  site: SupportedSite;
  username: string;
  password: string;
  loginRequest?: (input: {
    site: SupportedSite;
    username: string;
    password: string;
  }) => Promise<LoginResponse>;
  saveSession?: (input: {
    site: SupportedSite;
    cookie: string;
    username: string;
  }) => Promise<void>;
  rateGuard?: ReturnType<typeof createUpstreamRateGuard>;
}

async function defaultLoginRequest(input: {
  site: SupportedSite;
  username: string;
  password: string;
}): Promise<LoginResponse> {
  const baseUrl = input.site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const response = await axios.post(
    `${baseUrl}/api/v1/authentication/login`,
    { username: input.username, password: input.password },
    {
      headers: {
        Accept: "text/css",
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    }
  );

  return {
    status: response.status,
    data: response.data,
    headers: response.headers as Record<string, string | string[] | undefined>,
  };
}

async function defaultSaveSession(input: {
  site: SupportedSite;
  cookie: string;
  username: string;
}): Promise<void> {
  const store = await getDataStore();
  try {
    await store.saveKimonoSession(input);
  } finally {
    await store.disconnect();
  }
}

function getRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
}

function toRateLimitHeaders(headers?: Record<string, string | string[] | undefined>): { "retry-after"?: string } | undefined {
  const retryAfter = headers?.["retry-after"];
  if (typeof retryAfter === "string" && retryAfter.trim()) {
    return { "retry-after": retryAfter };
  }
  return undefined;
}

function extractCookieHeader(headers?: Record<string, string | string[] | undefined>): string | null {
  const rawCookies = headers?.["set-cookie"];
  const cookieList = Array.isArray(rawCookies)
    ? rawCookies
    : typeof rawCookies === "string"
      ? [rawCookies]
      : [];

  if (cookieList.length === 0) {
    return null;
  }

  const sessionMatch = cookieList.find((cookieValue) => cookieValue.startsWith("session="));
  return sessionMatch
    ? sessionMatch.split(";")[0]
    : cookieList.map((cookieValue) => cookieValue.split(";")[0].trim()).join("; ");
}

export async function processKimonoLogin(input: ProcessKimonoLoginInput): Promise<KimonoLoginResult> {
  const rateGuard = input.rateGuard ?? getGlobalUpstreamRateGuard();
  const bucket = "account" as const;
  const decision = rateGuard.canRequest(input.site, bucket);
  if (!decision.allowed) {
    return {
      status: 429,
      body: {
        error: "Connexion temporairement limitee. Reessaie dans un instant.",
        retryAfterMs: decision.retryAfterMs,
      },
      headers: {
        "Retry-After": getRetryAfterSeconds(decision.retryAfterMs),
      },
    };
  }

  const loginRequest = input.loginRequest ?? defaultLoginRequest;
  const saveSession = input.saveSession ?? defaultSaveSession;

  try {
    const response = await loginRequest(input);

    if (response.status === 429) {
      rateGuard.registerRateLimit(input.site, { status: 429, headers: toRateLimitHeaders(response.headers) }, bucket);
      const retryDecision = rateGuard.canRequest(input.site, bucket);
      return {
        status: 429,
        body: {
          error: "Connexion temporairement limitee. Reessaie dans un instant.",
          retryAfterMs: retryDecision.retryAfterMs,
        },
        headers: {
          "Retry-After": getRetryAfterSeconds(retryDecision.retryAfterMs),
        },
      };
    }

    if (response.status !== 200) {
      const isCredentialError = response.status === 400 || response.status === 401 || response.status === 403;
      return {
        status: isCredentialError ? 401 : 502,
        body: {
          error: response.data?.error || (isCredentialError ? `Connexion echouee (${response.status})` : `Service indisponible (${response.status})`),
        },
      };
    }

    const cookie = extractCookieHeader(response.headers);
    if (!cookie) {
      return {
        status: 401,
        body: {
          error: "Identifiants incorrects",
        },
      };
    }

    await saveSession({
      site: input.site,
      cookie,
      username: input.username,
    });

    return {
      status: 200,
      body: { success: true },
    };
  } catch (error) {
    const maybeCooldown = error as { code?: string; retryAfterMs?: number; status?: number };
    if (maybeCooldown?.code === "UPSTREAM_COOLDOWN" || maybeCooldown?.status === 429) {
      const retryAfterMs = Math.max(1_000, maybeCooldown.retryAfterMs ?? rateGuard.canRequest(input.site, bucket).retryAfterMs);
      return {
        status: 429,
        body: {
          error: "Connexion temporairement limitee. Reessaie dans un instant.",
          retryAfterMs,
        },
        headers: {
          "Retry-After": getRetryAfterSeconds(retryAfterMs),
        },
      };
    }

    return {
      status: 502,
      body: {
        error: "Connexion echouee",
      },
    };
  }
}
