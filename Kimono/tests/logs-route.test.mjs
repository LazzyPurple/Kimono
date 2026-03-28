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

test("logs route payload returns filtered recent logs", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kimono-logs-route-"));
  const logPath = path.join(tempRoot, "tmp", "app-debug.log");
  const { appendAppLog } = await import("../lib/app-logger.ts");
  const { getLogsRoutePayload } = await import("../lib/logs-route.ts");

  await withEnv(
    {
      APP_LOG_PATH: logPath,
    },
    async () => {
      await appendAppLog(
        {
          source: "api",
          level: "error",
          message: "search-creators failed",
          details: {
            route: "/api/creators/search",
          },
        },
        {
          workspaceRoot: tempRoot,
          now: new Date("2026-03-13T20:00:00.000Z"),
        }
      );

      await appendAppLog(
        {
          source: "auth",
          level: "info",
          message: "master_password_success",
        },
        {
          workspaceRoot: tempRoot,
          now: new Date("2026-03-13T20:01:00.000Z"),
        }
      );

      const payload = await getLogsRoutePayload(
        "http://localhost/api/logs?source=api&level=error&limit=10"
      );

      assert.equal(payload.ok, true);
      assert.equal(payload.logs.length, 1);
      assert.equal(payload.logs[0].source, "api");
      assert.equal(payload.logs[0].message, "search-creators failed");
      assert.equal(payload.filters.source, "api");
      assert.equal(payload.filters.level, "error");
    }
  );
});

test("logs route payload stores a client-side error in the shared log stream", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kimono-logs-route-"));
  const logPath = path.join(tempRoot, "tmp", "app-debug.log");

  await withEnv(
    {
      APP_LOG_PATH: logPath,
    },
    async () => {
      const { ingestLogsRoutePayload } = await import("../lib/logs-route.ts");
      const { readAppLogs } = await import("../lib/app-logger.ts");

      const payload = await ingestLogsRoutePayload({
        source: "client",
        level: "error",
        message: "Unhandled promise rejection",
        details: {
          pathname: "/search",
          kind: "unhandledrejection",
        },
      });

      assert.equal(payload.ok, true);
      assert.equal(payload.entry.source, "client");

      const logs = await readAppLogs({
        workspaceRoot: tempRoot,
      });

      assert.equal(logs.length, 1);
      assert.equal(logs[0].source, "client");
      assert.equal(logs[0].message, "Unhandled promise rejection");
      assert.equal(logs[0].details?.pathname, "/search");
    }
  );
});
