import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

test("app logger stores structured entries and returns the newest logs first", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kimono-app-logs-"));
  const { appendAppLog, readAppLogs } = await import("../lib/app-logger.ts");

  await appendAppLog(
    {
      source: "auth",
      level: "info",
      message: "master_password_attempt",
      details: {
        event: "master_password_attempt",
        hasPasswordInput: true,
      },
    },
    {
      workspaceRoot: tempRoot,
      now: new Date("2026-03-13T20:00:00.000Z"),
    }
  );

  await appendAppLog(
    {
      source: "db",
      level: "error",
      message: "database connection failed",
      details: {
        code: "ER_ACCESS_DENIED_ERROR",
      },
    },
    {
      workspaceRoot: tempRoot,
      now: new Date("2026-03-13T20:01:00.000Z"),
    }
  );

  const logs = await readAppLogs({
    workspaceRoot: tempRoot,
  });

  assert.equal(logs.length, 2);
  assert.equal(logs[0].source, "db");
  assert.equal(logs[0].message, "database connection failed");
  assert.equal(logs[1].source, "auth");
  assert.equal(logs[1].details?.event, "master_password_attempt");
  assert.ok(typeof logs[0].id === "string" && logs[0].id.length > 0);
});

test("app logger filters logs by source, level, and text query", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kimono-app-logs-"));
  const { appendAppLog, readAppLogs } = await import("../lib/app-logger.ts");

  await appendAppLog(
    {
      source: "api",
      level: "warn",
      message: "search served stale cache",
      details: {
        route: "/api/search-creators",
        source: "stale-cache",
      },
    },
    {
      workspaceRoot: tempRoot,
      now: new Date("2026-03-13T20:00:00.000Z"),
    }
  );

  await appendAppLog(
    {
      source: "client",
      level: "error",
      message: "Unhandled rejection on /search",
      details: {
        pathname: "/search",
      },
    },
    {
      workspaceRoot: tempRoot,
      now: new Date("2026-03-13T20:01:00.000Z"),
    }
  );

  const clientErrors = await readAppLogs({
    workspaceRoot: tempRoot,
    source: "client",
    level: "error",
    query: "Unhandled",
  });

  assert.equal(clientErrors.length, 1);
  assert.equal(clientErrors[0].source, "client");
  assert.equal(clientErrors[0].level, "error");
  assert.equal(clientErrors[0].details?.pathname, "/search");
});
