const fs = require("fs");
const path = require("path");

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "ADMIN_PASSWORD",
  "WEBAUTHN_RP_ID",
  "WEBAUTHN_ORIGIN",
  "NODE_ENV",
];

function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

function parsePort(rawPort) {
  const port = Number.parseInt(rawPort || "3000", 10);
  return Number.isFinite(port) ? port : 3000;
}

function parseEnvFile(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadRuntimeEnv({ appDir = process.cwd(), env = process.env, logger = console } = {}) {
  const envFiles = [".env.production.local", ".env.local", ".env.production", ".env"];
  const loadedFiles = [];

  for (const filename of envFiles) {
    const fullPath = path.join(appDir, filename);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    try {
      const parsed = parseEnvFile(fs.readFileSync(fullPath, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (env[key] === undefined) {
          env[key] = value;
        }
      }
      loadedFiles.push(filename);
    } catch (error) {
      logger.warn(`[BOOT] Failed to read ${filename}:`, error);
    }
  }

  return loadedFiles;
}

function buildServerConfig({ entryDir, env = process.env } = {}) {
  if (!entryDir) {
    throw new Error("entryDir is required to build the server config");
  }

  return {
    dev: false,
    dir: entryDir,
    hostname: "0.0.0.0",
    port: parsePort(env.PORT),
  };
}

function collectStartupDiagnostics({ appDir, cwd = process.cwd(), env = process.env } = {}) {
  const resolvedAppDir = appDir || process.cwd();

  return {
    appDir: resolvedAppDir,
    cwd,
    nodeVersion: process.version,
    port: parsePort(env.PORT),
    paths: {
      packageJson: fs.existsSync(path.join(resolvedAppDir, "package.json")),
      serverJs: fs.existsSync(path.join(resolvedAppDir, "server.js")),
      nextConfig: fs.existsSync(path.join(resolvedAppDir, "next.config.mjs")) || fs.existsSync(path.join(resolvedAppDir, "next.config.ts")),
      appDir: fs.existsSync(path.join(resolvedAppDir, "app")),
      nextDir: fs.existsSync(path.join(resolvedAppDir, ".next")),
      nextBuildId: fs.existsSync(path.join(resolvedAppDir, ".next", "BUILD_ID")),
      nodeModules: fs.existsSync(path.join(resolvedAppDir, "node_modules")),
    },
    environment: Object.fromEntries(
      REQUIRED_ENV_KEYS.map((key) => [key, Boolean(env[key])])
    ),
  };
}

function formatKeyValueBlock(title, values, truthy = "yes", falsy = "no") {
  const lines = Object.entries(values).map(([key, value]) => `  - ${key}=${value ? truthy : falsy}`);
  return [`[BOOT] ${title}:`, ...lines].join("\n");
}

function formatStartupDiagnostics(diagnostics) {
  return [
    `[BOOT] cwd=${diagnostics.cwd}`,
    `[BOOT] appDir=${diagnostics.appDir}`,
    `[BOOT] node=${diagnostics.nodeVersion}`,
    `[BOOT] port=${diagnostics.port}`,
    formatKeyValueBlock("paths", diagnostics.paths),
    formatKeyValueBlock("environment", diagnostics.environment, "present", "missing"),
  ].join("\n");
}

function formatFatalStartupError(error, diagnostics) {
  const normalized = normalizeError(error);

  return [
    `[BOOT] Fatal startup error: ${normalized.message}`,
    formatStartupDiagnostics(diagnostics),
    normalized.stack || "[BOOT] No stack trace available",
  ].join("\n");
}

module.exports = {
  REQUIRED_ENV_KEYS,
  buildServerConfig,
  collectStartupDiagnostics,
  formatFatalStartupError,
  formatStartupDiagnostics,
  loadRuntimeEnv,
};

