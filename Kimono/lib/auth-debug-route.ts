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
  | { type: "allowed"; via: "local-dev" | "debug-token" | "session" | "env-bypass" }
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
