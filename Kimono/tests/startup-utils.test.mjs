import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildServerConfig,
  collectStartupDiagnostics,
  formatFatalStartupError,
} from "../lib/server/startup.cjs";

test("buildServerConfig pins Next to the entry directory", () => {
  const config = buildServerConfig({
    entryDir: "/srv/apps/kimono/current",
    env: { PORT: "4123" },
  });

  assert.deepEqual(config, {
    dev: false,
    dir: "/srv/apps/kimono/current",
    hostname: "0.0.0.0",
    port: 4123,
  });
});

test("buildServerConfig falls back to port 3000 when PORT is invalid", () => {
  const config = buildServerConfig({
    entryDir: "/srv/apps/kimono/current",
    env: { PORT: "abc" },
  });

  assert.equal(config.port, 3000);
});

test("collectStartupDiagnostics reports file and env readiness for the app root", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-startup-"));

  fs.writeFileSync(path.join(tempRoot, "package.json"), "{}");
  fs.mkdirSync(path.join(tempRoot, "app"));
  fs.mkdirSync(path.join(tempRoot, ".next"));
  fs.writeFileSync(path.join(tempRoot, ".next", "BUILD_ID"), "build-123");
  fs.writeFileSync(path.join(tempRoot, "next.config.ts"), "export default {};");

  const diagnostics = collectStartupDiagnostics({
    appDir: tempRoot,
    cwd: "/home/user",
    env: {
      PORT: "3001",
      AUTH_SECRET: "secret",
      AUTH_URL: "https://kimono.paracosm.fr",
      ADMIN_PASSWORD: "admin",
      DATABASE_URL: "mysql://db",
    },
  });

  assert.equal(diagnostics.paths.packageJson, true);
  assert.equal(diagnostics.paths.appDir, true);
  assert.equal(diagnostics.paths.nextBuildId, true);
  assert.equal(diagnostics.paths.nextConfig, true);
  assert.equal(diagnostics.environment.AUTH_SECRET, true);
  assert.equal(diagnostics.environment.WEBAUTHN_ORIGIN, false);
  assert.equal(diagnostics.cwd, "/home/user");
  assert.equal(diagnostics.appDir, tempRoot);
});

test("formatFatalStartupError includes diagnostics to help Passenger debugging", () => {
  const message = formatFatalStartupError(
    new Error("Missing production build"),
    {
      appDir: "/home/app/kimono",
      cwd: "/tmp",
      nodeVersion: "v22.0.0",
      port: 3000,
      paths: {
        packageJson: true,
        nextBuildId: false,
      },
      environment: {
        AUTH_SECRET: true,
        DATABASE_URL: false,
      },
    }
  );

  assert.match(message, /Missing production build/);
  assert.match(message, /appDir=\/home\/app\/kimono/);
  assert.match(message, /cwd=\/tmp/);
  assert.match(message, /nextBuildId=no/);
  assert.match(message, /DATABASE_URL=missing/);
});
