import { createHash } from "node:crypto";
import { getDataStore } from "./db/index.ts";
import { resolveLocalDevMode } from "./local-dev-mode.ts";
import { shouldEnableCredentialAuth } from "./auth-guards.ts";
import { toAuthDebugErrorDetails, shouldEnableAuthDebugLog } from "./auth-debug.ts";
import { getDiagnosticAccessDecision } from "./diagnostic-access.ts";

import type { DataStore, StoredUser } from "./db/index.ts";

type EnvShape = Record<string, string | undefined>;
type AuthDebugStore = Pick<DataStore, "getOrCreateAdminUser" | "disconnect">;

type PasswordProbeResult =
  | "missing_input"
  | "missing_admin_password"
  | "match"
  | "mismatch";

type AuthorizationProbeResult =
  | "missing_input"
  | "credential_auth_disabled"
  | "missing_admin_password"
  | "password_mismatch"
  | "db_error"
  | "totp_required"
  | "success";

type AdminUserSnapshot = {
  exists: boolean;
  totpEnabled: boolean;
};

export type AuthDebugRouteAccessDecision =
  | { type: "allowed"; via: "local-dev" | "debug-token" | "session" }
  | { type: "denied" };

export type PasswordProbeSnapshot = {
  checked: boolean;
  result: PasswordProbeResult;
};

export type AuthorizationProbeSnapshot = {
  checked: boolean;
  result: AuthorizationProbeResult;
  user?: AdminUserSnapshot;
  error?: ReturnType<typeof toAuthDebugErrorDetails>;
};

export type AuthDebugSnapshot = {
  localDevMode: boolean;
  credentialAuthEnabled: boolean;
  nodeEnv: string | null;
  env: {
    adminPasswordConfigured: boolean;
    authSecretConfigured: boolean;
    authUrlConfigured: boolean;
    webauthnOriginConfigured: boolean;
    webauthnRpIdConfigured: boolean;
    webauthnRpNameConfigured: boolean;
    authDebugLogEnabled: boolean;
  };
  database:
    | {
        ok: true;
        adminUser: AdminUserSnapshot;
      }
    | {
        ok: false;
        error: ReturnType<typeof toAuthDebugErrorDetails>;
      };
};

export type DatabaseUrlDebugSnapshot = {
  scheme: string | null;
  hasCredentials: boolean;
  hasHostname: boolean;
  hasPort: boolean;
  hasDatabaseName: boolean;
  hasWhitespace: boolean;
  hasNewline: boolean;
  hasQuotes: boolean;
  hasLeadingOrTrailingWhitespace: boolean;
  parseable: boolean;
  valueHash: string;
};

export type PublicRuntimeEnvProbe = {
  routeVersion: "2026-03-13-open-auth-debug-v2";
  nodeEnv: string | null;
  localDevMode: boolean;
  credentialAuthEnabled: boolean;
  env: {
    databaseUrlConfigured: boolean;
    adminPasswordConfigured: boolean;
    authSecretConfigured: boolean;
    authUrlConfigured: boolean;
    webauthnOriginConfigured: boolean;
    webauthnRpIdConfigured: boolean;
    webauthnRpNameConfigured: boolean;
    authDebugLogEnabled: boolean;
    authDebugTokenConfigured: boolean;
    databaseUrlDebug: DatabaseUrlDebugSnapshot | null;
  };
};

function hasConfiguredValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function shouldSkipLiveAuthDatabaseProbe(env: EnvShape = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build" || env.npm_lifecycle_event === "build";
}

function createBuildProbeSkippedErrorDetails(): ReturnType<typeof toAuthDebugErrorDetails> {
  return {
    errorName: "BuildProbeSkipped",
    errorMessage: "Runtime auth/database probe skipped during build.",
    errorCode: "BUILD_PROBE_SKIPPED",
  };
}

function toAdminUserSnapshot(user: StoredUser): AdminUserSnapshot {
  return {
    exists: true,
    totpEnabled: Boolean(user.totpEnabled),
  };
}

function getDatabaseUrlDebugSnapshot(databaseUrl: string | undefined): DatabaseUrlDebugSnapshot | null {
  if (!databaseUrl) {
    return null;
  }

  const rawValue = databaseUrl;
  const trimmedValue = rawValue.trim();
  const match = trimmedValue.match(/^([a-z0-9+.-]+):\/\/([^:@/?#]+)(?::([^@/?#]*))?@([^:/?#]+)(?::(\d+))?(?:\/([^?#]*))?/i);

  return {
    scheme: match?.[1] ?? null,
    hasCredentials: Boolean(match?.[2]),
    hasHostname: Boolean(match?.[4]),
    hasPort: Boolean(match?.[5]),
    hasDatabaseName: Boolean(match?.[6]),
    hasWhitespace: /\s/.test(rawValue),
    hasNewline: /[\r\n]/.test(rawValue),
    hasQuotes: /["'`]/.test(rawValue),
    hasLeadingOrTrailingWhitespace: rawValue !== trimmedValue,
    parseable: Boolean(match),
    valueHash: createHash("sha256").update(rawValue).digest("hex").slice(0, 12),
  };
}

export function collectPublicRuntimeEnvProbe(
  env: EnvShape = process.env
): PublicRuntimeEnvProbe {
  const localDevMode = resolveLocalDevMode(env);

  return {
    routeVersion: "2026-03-13-open-auth-debug-v2",
    nodeEnv: env.NODE_ENV ?? null,
    localDevMode,
    credentialAuthEnabled: shouldEnableCredentialAuth(localDevMode),
    env: {
      databaseUrlConfigured: hasConfiguredValue(env.DATABASE_URL),
      adminPasswordConfigured: hasConfiguredValue(env.ADMIN_PASSWORD),
      authSecretConfigured: hasConfiguredValue(env.AUTH_SECRET),
      authUrlConfigured: hasConfiguredValue(env.AUTH_URL),
      webauthnOriginConfigured: hasConfiguredValue(env.WEBAUTHN_ORIGIN),
      webauthnRpIdConfigured: hasConfiguredValue(env.WEBAUTHN_RP_ID),
      webauthnRpNameConfigured: hasConfiguredValue(env.WEBAUTHN_RP_NAME),
      authDebugLogEnabled: shouldEnableAuthDebugLog(env),
      authDebugTokenConfigured: hasConfiguredValue(env.AUTH_DEBUG_TOKEN),
      databaseUrlDebug: getDatabaseUrlDebugSnapshot(env.DATABASE_URL),
    },
  };
}

export function collectDatabaseUrlDebugPayload(env: EnvShape = process.env) {
  const runtime = collectPublicRuntimeEnvProbe(env);

  return {
    ok: true,
    databaseUrlConfigured: runtime.env.databaseUrlConfigured,
    databaseUrlDebug: runtime.env.databaseUrlDebug,
  };
}

export function resolveAuthDebugToken(env: EnvShape = process.env): string | null {
  const token = env.AUTH_DEBUG_TOKEN?.trim();
  return token ? token : null;
}

export function getAuthDebugRouteAccessDecision(
  providedToken: string | null | undefined,
  env: EnvShape = process.env
): AuthDebugRouteAccessDecision {
  return getDiagnosticAccessDecision({
    localDevMode: resolveLocalDevMode(env),
    session: null,
    providedToken,
    env,
  });
}

export function probeAdminPassword(
  password: string | null | undefined,
  env: EnvShape = process.env
): PasswordProbeSnapshot {
  if (!password) {
    return {
      checked: false,
      result: "missing_input",
    };
  }

  const configuredPassword = env.ADMIN_PASSWORD?.trim();
  if (!configuredPassword) {
    return {
      checked: true,
      result: "missing_admin_password",
    };
  }

  return {
    checked: true,
    result: password.trim() === configuredPassword ? "match" : "mismatch",
  };
}

export async function simulateMasterPasswordAuthorize(
  password: string | null | undefined,
  options?: {
    env?: EnvShape;
    getStore?: () => Promise<AuthDebugStore>;
  }
): Promise<AuthorizationProbeSnapshot> {
  const env = options?.env ?? process.env;
  const localDevMode = resolveLocalDevMode(env);
  const credentialAuthEnabled = shouldEnableCredentialAuth(localDevMode);

  if (!credentialAuthEnabled) {
    return {
      checked: true,
      result: "credential_auth_disabled",
    };
  }

  if (!password) {
    return {
      checked: false,
      result: "missing_input",
    };
  }

  const configuredPassword = env.ADMIN_PASSWORD?.trim();
  if (!configuredPassword) {
    return {
      checked: true,
      result: "missing_admin_password",
    };
  }

  if (password.trim() !== configuredPassword) {
    return {
      checked: true,
      result: "password_mismatch",
    };
  }

  if (shouldSkipLiveAuthDatabaseProbe(env)) {
    return {
      checked: true,
      result: "db_error",
      error: createBuildProbeSkippedErrorDetails(),
    };
  }

  let store: AuthDebugStore | undefined;

  try {
    store = await (options?.getStore ?? getDataStore)();
    const user = await store.getOrCreateAdminUser();
    const snapshot = toAdminUserSnapshot(user);

    if (snapshot.totpEnabled) {
      return {
        checked: true,
        result: "totp_required",
        user: snapshot,
      };
    }

    return {
      checked: true,
      result: "success",
      user: snapshot,
    };
  } catch (error) {
    return {
      checked: true,
      result: "db_error",
      error: toAuthDebugErrorDetails(error),
    };
  } finally {
    try {
      await store?.disconnect();
    } catch {
      // Ignore disconnect errors in diagnostics.
    }
  }
}

export async function collectAuthDebugSnapshot(options?: {
  env?: EnvShape;
  getStore?: () => Promise<AuthDebugStore>;
}): Promise<AuthDebugSnapshot> {
  const env = options?.env ?? process.env;
  const localDevMode = resolveLocalDevMode(env);
  const credentialAuthEnabled = shouldEnableCredentialAuth(localDevMode);

  if (shouldSkipLiveAuthDatabaseProbe(env)) {
    return {
      localDevMode,
      credentialAuthEnabled,
      nodeEnv: env.NODE_ENV ?? null,
      env: {
        adminPasswordConfigured: hasConfiguredValue(env.ADMIN_PASSWORD),
        authSecretConfigured: hasConfiguredValue(env.AUTH_SECRET),
        authUrlConfigured: hasConfiguredValue(env.AUTH_URL),
        webauthnOriginConfigured: hasConfiguredValue(env.WEBAUTHN_ORIGIN),
        webauthnRpIdConfigured: hasConfiguredValue(env.WEBAUTHN_RP_ID),
        webauthnRpNameConfigured: hasConfiguredValue(env.WEBAUTHN_RP_NAME),
        authDebugLogEnabled: shouldEnableAuthDebugLog(env),
      },
      database: {
        ok: false,
        error: createBuildProbeSkippedErrorDetails(),
      },
    };
  }

  let store: AuthDebugStore | undefined;

  try {
    store = await (options?.getStore ?? getDataStore)();
    const user = await store.getOrCreateAdminUser();

    return {
      localDevMode,
      credentialAuthEnabled,
      nodeEnv: env.NODE_ENV ?? null,
      env: {
        adminPasswordConfigured: hasConfiguredValue(env.ADMIN_PASSWORD),
        authSecretConfigured: hasConfiguredValue(env.AUTH_SECRET),
        authUrlConfigured: hasConfiguredValue(env.AUTH_URL),
        webauthnOriginConfigured: hasConfiguredValue(env.WEBAUTHN_ORIGIN),
        webauthnRpIdConfigured: hasConfiguredValue(env.WEBAUTHN_RP_ID),
        webauthnRpNameConfigured: hasConfiguredValue(env.WEBAUTHN_RP_NAME),
        authDebugLogEnabled: shouldEnableAuthDebugLog(env),
      },
      database: {
        ok: true,
        adminUser: toAdminUserSnapshot(user),
      },
    };
  } catch (error) {
    return {
      localDevMode,
      credentialAuthEnabled,
      nodeEnv: env.NODE_ENV ?? null,
      env: {
        adminPasswordConfigured: hasConfiguredValue(env.ADMIN_PASSWORD),
        authSecretConfigured: hasConfiguredValue(env.AUTH_SECRET),
        authUrlConfigured: hasConfiguredValue(env.AUTH_URL),
        webauthnOriginConfigured: hasConfiguredValue(env.WEBAUTHN_ORIGIN),
        webauthnRpIdConfigured: hasConfiguredValue(env.WEBAUTHN_RP_ID),
        webauthnRpNameConfigured: hasConfiguredValue(env.WEBAUTHN_RP_NAME),
        authDebugLogEnabled: shouldEnableAuthDebugLog(env),
      },
      database: {
        ok: false,
        error: toAuthDebugErrorDetails(error),
      },
    };
  } finally {
    try {
      await store?.disconnect();
    } catch {
      // Ignore disconnect errors in diagnostics.
    }
  }
}


