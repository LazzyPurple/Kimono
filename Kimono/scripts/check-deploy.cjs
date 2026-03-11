const {
  REQUIRED_ENV_KEYS,
  collectStartupDiagnostics,
  formatStartupDiagnostics,
  loadRuntimeEnv,
} = require("../lib/server/startup.cjs");

const appDir = process.cwd();
const loadedEnvFiles = loadRuntimeEnv({ appDir });
const diagnostics = collectStartupDiagnostics({ appDir, cwd: process.cwd(), env: process.env });

if (loadedEnvFiles.length > 0) {
  console.log(`[DEPLOY CHECK] Loaded env files: ${loadedEnvFiles.join(", ")}`);
}

console.log(formatStartupDiagnostics(diagnostics));

const missingPaths = Object.entries(diagnostics.paths)
  .filter(([, present]) => !present)
  .map(([key]) => key);

const missingRequiredEnv = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);

if (missingPaths.length > 0) {
  console.error(`[DEPLOY CHECK] Missing required app files/directories: ${missingPaths.join(", ")}`);
}

if (missingRequiredEnv.length > 0) {
  console.error(`[DEPLOY CHECK] Missing required environment variables: ${missingRequiredEnv.join(", ")}`);
}

if (missingPaths.length > 0 || missingRequiredEnv.length > 0) {
  process.exit(1);
}

console.log("[DEPLOY CHECK] OK - startup prerequisites look good.");
