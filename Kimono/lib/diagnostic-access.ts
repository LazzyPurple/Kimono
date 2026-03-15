import { timingSafeEqual } from "node:crypto";

import { isLocalDevMode } from "./local-dev-mode.ts";

export type DiagnosticSession = {
  needsTotp?: boolean | null;
  user?: {
    id?: string | null;
  } | null;
} | null;

type EnvShape = Record<string, string | undefined>;

type DiagnosticTokenInput = {
  headers?: Headers | null;
  url?: string | URL | null;
};

export type DiagnosticAccessDecision =
  | {
      type: "allowed";
      via: "local-dev" | "session" | "debug-token";
    }
  | {
      type: "denied";
    };

function normalizeToken(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

function getHeaderToken(headers?: Headers | null): string | null {
  return normalizeToken(headers?.get("x-auth-debug-token") ?? null);
}

function getQueryToken(url?: string | URL | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = typeof url === "string" ? new URL(url) : url;
    return normalizeToken(parsedUrl.searchParams.get("debugToken"));
  } catch {
    return null;
  }
}

export function extractDiagnosticAccessToken(input: DiagnosticTokenInput = {}): string | null {
  return getHeaderToken(input.headers) ?? getQueryToken(input.url);
}

export function hasValidDiagnosticAccessToken(
  providedToken: string | null | undefined,
  env: EnvShape = process.env
): boolean {
  const expectedToken = normalizeToken(env.AUTH_DEBUG_TOKEN);
  const candidateToken = normalizeToken(providedToken);

  if (!expectedToken || !candidateToken) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const candidateBuffer = Buffer.from(candidateToken);

  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function getDiagnosticAccessDecision(input: {
  localDevMode: boolean;
  session: DiagnosticSession;
  providedToken: string | null | undefined;
  env?: EnvShape;
}): DiagnosticAccessDecision {
  if (input.localDevMode) {
    return {
      type: "allowed",
      via: "local-dev",
    };
  }

  if (input.session?.user?.id && !input.session.needsTotp) {
    return {
      type: "allowed",
      via: "session",
    };
  }

  if (hasValidDiagnosticAccessToken(input.providedToken, input.env)) {
    return {
      type: "allowed",
      via: "debug-token",
    };
  }

  return {
    type: "denied",
  };
}

export async function getCurrentDiagnosticAccessDecision(
  input: DiagnosticTokenInput = {}
): Promise<DiagnosticAccessDecision> {
  const localDevMode = isLocalDevMode();
  const providedToken = extractDiagnosticAccessToken(input);

  if (localDevMode || hasValidDiagnosticAccessToken(providedToken)) {
    return getDiagnosticAccessDecision({
      localDevMode,
      session: null,
      providedToken,
    });
  }

  try {
    const { auth } = await import("../auth.ts");
    const session = (await auth()) as DiagnosticSession;

    return getDiagnosticAccessDecision({
      localDevMode,
      session,
      providedToken,
    });
  } catch {
    return {
      type: "denied",
    };
  }
}
