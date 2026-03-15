import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("logs dashboard data includes auth runtime snapshot and recent logs", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kimono-logs-dashboard-"));
  const logPath = path.join(tempRoot, "tmp", "app-debug.log");

  await withEnv(
    {
      APP_LOG_PATH: logPath,
      NODE_ENV: "production",
      ADMIN_PASSWORD: "KimonoTest2026",
      AUTH_SECRET: "secret",
      AUTH_URL: "https://kimono.paracosm.fr",
      WEBAUTHN_ORIGIN: "https://kimono.paracosm.fr",
      WEBAUTHN_RP_ID: "kimono.paracosm.fr",
      WEBAUTHN_RP_NAME: "Kimono",
    },
    async () => {
      const { appendAppLog } = await import("../lib/app-logger.ts");
      const { getLogsDashboardData } = await import("../lib/logs-dashboard.ts");

      await appendAppLog(
        {
          source: "api",
          level: "error",
          message: "search-creators failed",
        },
        {
          workspaceRoot: tempRoot,
          now: new Date("2026-03-13T21:00:00.000Z"),
        }
      );

      const dashboard = await getLogsDashboardData({
        url: "http://localhost/logs?source=api",
        getStore: async () => ({
          async getOrCreateAdminUser() {
            return {
              id: "user_123",
              email: "admin@kimono.local",
              totpSecret: null,
              totpEnabled: false,
              createdAt: new Date("2026-03-13T20:43:05.921Z"),
            };
          },
          async disconnect() {
            return;
          },
        }),
      });

      assert.equal(dashboard.logs.logs.length, 1);
      assert.equal(dashboard.logs.logs[0].source, "api");
      assert.equal(dashboard.auth.runtime.env.adminPasswordConfigured, true);
      assert.equal(dashboard.auth.auth.database.ok, true);
      assert.equal(dashboard.auth.auth.database.adminUser?.exists, true);
      assert.equal(dashboard.auth.auth.database.adminUser?.totpEnabled, false);
      assert.equal("passwordProbe" in dashboard.auth, false);
      assert.equal("authorizationProbe" in dashboard.auth, false);
    }
  );
});

test("logs dashboard skips live auth and database probes during build", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kimono-logs-dashboard-"));
  const logPath = path.join(tempRoot, "tmp", "app-debug.log");
  let storeTouched = false;

  await withEnv(
    {
      APP_LOG_PATH: logPath,
      NODE_ENV: "production",
      npm_lifecycle_event: "build",
      ADMIN_PASSWORD: "KimonoTest2026",
      AUTH_SECRET: "secret",
      AUTH_URL: "https://kimono.paracosm.fr",
      WEBAUTHN_ORIGIN: "https://kimono.paracosm.fr",
      WEBAUTHN_RP_ID: "kimono.paracosm.fr",
      WEBAUTHN_RP_NAME: "Kimono",
    },
    async () => {
      const { getLogsDashboardData } = await import("../lib/logs-dashboard.ts");

      const dashboard = await getLogsDashboardData({
        url: "http://localhost/logs",
        getStore: async () => {
          storeTouched = true;
          throw new Error("store should not be touched during build");
        },
      });

      assert.equal(storeTouched, false);
      assert.equal(dashboard.auth.auth.database.ok, false);
      assert.equal(dashboard.auth.auth.database.error?.errorName, "BuildProbeSkipped");
      assert.equal(
        dashboard.auth.auth.database.error?.errorMessage,
        "Runtime auth/database probe skipped during build."
      );
    }
  );
});
