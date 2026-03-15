import test from "node:test";
import assert from "node:assert/strict";

import {
  collectAuthDebugSnapshot,
  collectPublicRuntimeEnvProbe,
  getAuthDebugRouteAccessDecision,
  probeAdminPassword,
  simulateMasterPasswordAuthorize,
} from "../lib/auth-debug-route.ts";

test("debug auth route requires local dev mode or a matching debug token", () => {
  assert.deepEqual(
    getAuthDebugRouteAccessDecision(null, {
      NODE_ENV: "production",
    }),
    {
      type: "denied",
    }
  );

  assert.deepEqual(
    getAuthDebugRouteAccessDecision("wrong-token", {
      NODE_ENV: "production",
      AUTH_DEBUG_TOKEN: "expected-token",
    }),
    {
      type: "denied",
    }
  );

  assert.deepEqual(
    getAuthDebugRouteAccessDecision("expected-token", {
      NODE_ENV: "production",
      AUTH_DEBUG_TOKEN: "expected-token",
    }),
    {
      type: "allowed",
      via: "debug-token",
    }
  );

  assert.deepEqual(
    getAuthDebugRouteAccessDecision(null, {
      NODE_ENV: "development",
      LOCAL_DEV_MODE: "true",
    }),
    {
      type: "allowed",
      via: "local-dev",
    }
  );
});

test("probeAdminPassword reports match, mismatch, and missing configuration without exposing the secret", () => {
  assert.deepEqual(probeAdminPassword(undefined, {}), {
    checked: false,
    result: "missing_input",
  });

  assert.deepEqual(probeAdminPassword("hello", {}), {
    checked: true,
    result: "missing_admin_password",
  });

  assert.deepEqual(
    probeAdminPassword("hello", {
      ADMIN_PASSWORD: "hello",
    }),
    {
      checked: true,
      result: "match",
    }
  );

  assert.deepEqual(
    probeAdminPassword("goodbye", {
      ADMIN_PASSWORD: "hello",
    }),
    {
      checked: true,
      result: "mismatch",
    }
  );
});

test("simulateMasterPasswordAuthorize reports password mismatch before touching the store", async () => {
  let called = false;

  const snapshot = await simulateMasterPasswordAuthorize("wrong", {
    env: {
      ADMIN_PASSWORD: "expected",
      NODE_ENV: "production",
    },
    getStore: async () => {
      called = true;
      return {
        async getOrCreateAdminUser() {
          throw new Error("should not run");
        },
        async disconnect() {
          return;
        },
      };
    },
  });

  assert.equal(snapshot.checked, true);
  assert.equal(snapshot.result, "password_mismatch");
  assert.equal(called, false);
});

test("simulateMasterPasswordAuthorize reports database errors after a password match", async () => {
  const snapshot = await simulateMasterPasswordAuthorize("expected", {
    env: {
      ADMIN_PASSWORD: "expected",
      NODE_ENV: "production",
    },
    getStore: async () => ({
      async getOrCreateAdminUser() {
        const error = new Error("Access denied for user");
        Object.assign(error, {
          code: "ER_ACCESS_DENIED_ERROR",
          errno: 1045,
          sqlState: "28000",
        });
        throw error;
      },
      async disconnect() {
        return;
      },
    }),
  });

  assert.equal(snapshot.checked, true);
  assert.equal(snapshot.result, "db_error");
  assert.equal(snapshot.error?.errorCode, "ER_ACCESS_DENIED_ERROR");
  assert.equal(snapshot.error?.errorErrno, 1045);
});

test("simulateMasterPasswordAuthorize reports a TOTP requirement when the admin has 2FA enabled", async () => {
  const snapshot = await simulateMasterPasswordAuthorize("expected", {
    env: {
      ADMIN_PASSWORD: "expected",
      NODE_ENV: "production",
    },
    getStore: async () => ({
      async getOrCreateAdminUser() {
        return {
          id: "user_123",
          email: "admin@kimono.local",
          totpSecret: "totp-secret",
          totpEnabled: true,
          createdAt: new Date("2026-03-12T18:00:00.000Z"),
        };
      },
      async disconnect() {
        return;
      },
    }),
  });

  assert.equal(snapshot.checked, true);
  assert.equal(snapshot.result, "totp_required");
  assert.equal(snapshot.user?.exists, true);
  assert.equal(snapshot.user?.totpEnabled, true);
  assert.equal("id" in snapshot.user, false);
});

test("simulateMasterPasswordAuthorize reports success when the admin user is ready", async () => {
  const snapshot = await simulateMasterPasswordAuthorize("expected", {
    env: {
      ADMIN_PASSWORD: "expected",
      NODE_ENV: "production",
    },
    getStore: async () => ({
      async getOrCreateAdminUser() {
        return {
          id: "user_123",
          email: "admin@kimono.local",
          totpSecret: null,
          totpEnabled: false,
          createdAt: new Date("2026-03-12T18:00:00.000Z"),
        };
      },
      async disconnect() {
        return;
      },
    }),
  });

  assert.equal(snapshot.checked, true);
  assert.equal(snapshot.result, "success");
  assert.equal(snapshot.user?.exists, true);
  assert.equal(snapshot.user?.totpEnabled, false);
  assert.equal("id" in snapshot.user, false);
});

test("collectAuthDebugSnapshot reports auth config and database readiness", async () => {
  const snapshot = await collectAuthDebugSnapshot({
    env: {
      NODE_ENV: "production",
      ADMIN_PASSWORD: "configured",
      AUTH_SECRET: "secret",
      AUTH_URL: "https://kimono.paracosm.fr",
      WEBAUTHN_ORIGIN: "https://kimono.paracosm.fr",
      WEBAUTHN_RP_ID: "kimono.paracosm.fr",
      WEBAUTHN_RP_NAME: "Kimono",
    },
    getStore: async () => ({
      async getOrCreateAdminUser() {
        return {
          id: "user_123",
          email: "admin@kimono.local",
          totpSecret: "totp-secret",
          totpEnabled: true,
          createdAt: new Date("2026-03-12T18:00:00.000Z"),
        };
      },
      async disconnect() {
        return;
      },
    }),
  });

  assert.equal(snapshot.localDevMode, false);
  assert.equal(snapshot.credentialAuthEnabled, true);
  assert.equal(snapshot.env.adminPasswordConfigured, true);
  assert.equal(snapshot.env.authSecretConfigured, true);
  assert.equal(snapshot.env.authUrlConfigured, true);
  assert.equal(snapshot.env.webauthnOriginConfigured, true);
  assert.equal(snapshot.env.webauthnRpIdConfigured, true);
  assert.equal(snapshot.env.webauthnRpNameConfigured, true);
  assert.equal(snapshot.database.ok, true);
  assert.equal(snapshot.database.adminUser?.exists, true);
  assert.equal(snapshot.database.adminUser?.totpEnabled, true);
  assert.equal("id" in snapshot.database.adminUser, false);
  assert.equal("email" in snapshot.database.adminUser, false);
  assert.equal("createdAt" in snapshot.database.adminUser, false);
});

test("collectAuthDebugSnapshot reports database errors without throwing", async () => {
  const snapshot = await collectAuthDebugSnapshot({
    env: {
      NODE_ENV: "production",
      ADMIN_PASSWORD: "configured",
    },
    getStore: async () => ({
      async getOrCreateAdminUser() {
        const error = new Error("Access denied for user");
        Object.assign(error, {
          code: "ER_ACCESS_DENIED_ERROR",
          errno: 1045,
          sqlState: "28000",
        });
        throw error;
      },
      async disconnect() {
        return;
      },
    }),
  });

  assert.equal(snapshot.database.ok, false);
  assert.equal(snapshot.database.error?.errorMessage, "Access denied for user");
  assert.equal(snapshot.database.error?.errorCode, "ER_ACCESS_DENIED_ERROR");
  assert.equal(snapshot.database.error?.errorErrno, 1045);
  assert.equal(snapshot.database.error?.errorSqlState, "28000");
});

test("collectPublicRuntimeEnvProbe exposes a sanitized database url diagnostic without revealing the password", () => {
  const probe = collectPublicRuntimeEnvProbe({
    NODE_ENV: "production",
    DATABASE_URL: "mysql://dosa4307_kimono: b9T2NJ3924vj3UhBbn2T @localhost:3306/dosa4307_kimono\n",
    ADMIN_PASSWORD: "configured",
    AUTH_SECRET: "secret",
    AUTH_URL: "https://kimono.paracosm.fr",
    WEBAUTHN_ORIGIN: "https://kimono.paracosm.fr",
    WEBAUTHN_RP_ID: "kimono.paracosm.fr",
    WEBAUTHN_RP_NAME: "Kimono",
    AUTH_DEBUG_TOKEN: "debug-token",
  });

  assert.equal(probe.routeVersion, "2026-03-13-open-auth-debug-v2");
  assert.equal(probe.nodeEnv, "production");
  assert.equal(probe.localDevMode, false);
  assert.equal(probe.credentialAuthEnabled, true);
  assert.equal(probe.env.databaseUrlConfigured, true);
  assert.equal(probe.env.adminPasswordConfigured, true);
  assert.equal(probe.env.authSecretConfigured, true);
  assert.equal(probe.env.authUrlConfigured, true);
  assert.equal(probe.env.webauthnOriginConfigured, true);
  assert.equal(probe.env.webauthnRpIdConfigured, true);
  assert.equal(probe.env.webauthnRpNameConfigured, true);
  assert.equal(probe.env.authDebugTokenConfigured, true);
  assert.equal(probe.env.databaseUrlDebug.scheme, "mysql");
  assert.equal(probe.env.databaseUrlDebug.hasCredentials, true);
  assert.equal(probe.env.databaseUrlDebug.hasHostname, true);
  assert.equal(probe.env.databaseUrlDebug.hasPort, true);
  assert.equal(probe.env.databaseUrlDebug.hasDatabaseName, true);
  assert.equal(probe.env.databaseUrlDebug.hasWhitespace, true);
  assert.equal(probe.env.databaseUrlDebug.hasNewline, true);
  assert.equal(probe.env.databaseUrlDebug.hasQuotes, false);
  assert.equal(typeof probe.env.databaseUrlDebug.valueHash, "string");
  assert.equal(probe.env.databaseUrlDebug.valueHash.length, 12);
  assert.equal("username" in probe.env.databaseUrlDebug, false);
  assert.equal("hostname" in probe.env.databaseUrlDebug, false);
  assert.equal("port" in probe.env.databaseUrlDebug, false);
  assert.equal("databaseName" in probe.env.databaseUrlDebug, false);
  assert.equal("passwordLength" in probe.env.databaseUrlDebug, false);
  assert.equal("passwordPreviewStart" in probe.env.databaseUrlDebug, false);
  assert.equal("passwordPreviewEnd" in probe.env.databaseUrlDebug, false);
  assert.equal("rawValue" in probe.env.databaseUrlDebug, false);
  assert.equal("password" in probe.env.databaseUrlDebug, false);
});
