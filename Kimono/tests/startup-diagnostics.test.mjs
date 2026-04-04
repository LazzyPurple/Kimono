import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectStartupDiagnostics } = require("../lib/server/startup.cjs");

test("collectStartupDiagnostics reports runtime readiness for database, session store and preview tools", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-startup-"));
  const ffmpegPath = path.join(tempDir, "ffmpeg");
  fs.writeFileSync(ffmpegPath, "placeholder", "utf8");

  const diagnostics = collectStartupDiagnostics({
    appDir: tempDir,
    cwd: tempDir,
    env: {
      PORT: "3001",
      DATABASE_URL: "postgres://user:pass@localhost:5432/kimono",
      AUTH_SECRET: "secret",
      AUTH_URL: "https://kimono.example",
      ADMIN_PASSWORD: "admin",
      WEBAUTHN_RP_ID: "kimono.example",
      WEBAUTHN_ORIGIN: "https://kimono.example",
      NODE_ENV: "production",
      FFMPEG_PATH: ffmpegPath,
      FFPROBE_PATH: path.join(tempDir, "missing-ffprobe"),
    },
  });

  assert.equal(diagnostics.runtime.database.configured, true);
  assert.equal(diagnostics.runtime.database.driver, "postgres");
  assert.equal(diagnostics.runtime.sessionStore.configured, true);
  assert.equal(diagnostics.runtime.previewTools.ffmpeg.status, "configured");
  assert.equal(diagnostics.runtime.previewTools.ffprobe.status, "missing");
});
