import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendAuthDebugLog,
  resolveAuthDebugLogPath,
  shouldEnableAuthDebugLog,
} from "../lib/auth-debug.ts";

test("shouldEnableAuthDebugLog only enables explicit truthy values", () => {
  assert.equal(shouldEnableAuthDebugLog({ AUTH_DEBUG_LOG: "true" }), true);
  assert.equal(shouldEnableAuthDebugLog({ AUTH_DEBUG_LOG: "1" }), true);
  assert.equal(shouldEnableAuthDebugLog({ AUTH_DEBUG_LOG: "false" }), false);
  assert.equal(shouldEnableAuthDebugLog({}), false);
});

test("resolveAuthDebugLogPath defaults to tmp/auth-debug.log", () => {
  assert.equal(
    resolveAuthDebugLogPath({}, "/srv/kimono"),
    path.join("/srv/kimono", "tmp", "auth-debug.log")
  );

  assert.equal(
    resolveAuthDebugLogPath({ AUTH_DEBUG_LOG_PATH: "logs/auth.log" }, "/srv/kimono"),
    path.resolve("/srv/kimono", "logs", "auth.log")
  );
});

test("appendAuthDebugLog is a no-op when AUTH_DEBUG_LOG is disabled", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-auth-log-off-"));
  const logPath = path.join(tempDir, "auth.log");

  try {
    const didWrite = await appendAuthDebugLog("login_attempt", { ok: false }, {
      env: {
        AUTH_DEBUG_LOG: "false",
        AUTH_DEBUG_LOG_PATH: logPath,
      },
      workspaceRoot: tempDir,
    });

    assert.equal(didWrite, false);
    assert.equal(fs.existsSync(logPath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("appendAuthDebugLog writes structured JSON lines when enabled", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-auth-log-on-"));
  const logPath = path.join(tempDir, "auth.log");

  try {
    const didWrite = await appendAuthDebugLog(
      "master_password_db_error",
      {
        reason: "database_error",
        adminPasswordConfigured: true,
      },
      {
        env: {
          AUTH_DEBUG_LOG: "true",
          AUTH_DEBUG_LOG_PATH: logPath,
        },
        workspaceRoot: tempDir,
      }
    );

    assert.equal(didWrite, true);

    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.event, "master_password_db_error");
    assert.equal(entry.reason, "database_error");
    assert.equal(entry.adminPasswordConfigured, true);
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("appendAuthDebugLog rotates the file when it exceeds the max size", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-auth-log-rotate-"));
  const logPath = path.join(tempDir, "auth.log");

  try {
    fs.writeFileSync(logPath, "x".repeat(256), "utf8");

    await appendAuthDebugLog(
      "login_attempt",
      {
        reason: "retry",
      },
      {
        env: {
          AUTH_DEBUG_LOG: "true",
          AUTH_DEBUG_LOG_PATH: logPath,
        },
        workspaceRoot: tempDir,
        maxBytes: 32,
      }
    );

    assert.equal(fs.existsSync(`${logPath}.1`), true);
    const rotated = fs.readFileSync(`${logPath}.1`, "utf8");
    assert.equal(rotated.length, 256);

    const current = fs.readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(current.length, 1);
    assert.equal(JSON.parse(current[0]).event, "login_attempt");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
