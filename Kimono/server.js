const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const {
  buildServerConfig,
  collectStartupDiagnostics,
  formatFatalStartupError,
  formatStartupDiagnostics,
  loadRuntimeEnv,
} = require("./lib/server/startup.cjs");

const entryDir = __dirname;
const loadedEnvFiles = loadRuntimeEnv({ appDir: entryDir });
const serverConfig = buildServerConfig({ entryDir, env: process.env });

function currentDiagnostics() {
  return collectStartupDiagnostics({
    appDir: entryDir,
    cwd: process.cwd(),
    env: process.env,
  });
}

function logFatal(error) {
  console.error(formatFatalStartupError(error, currentDiagnostics()));
}

if (loadedEnvFiles.length > 0) {
  console.log(`[BOOT] Loaded env files: ${loadedEnvFiles.join(", ")}`);
}

console.log(formatStartupDiagnostics(currentDiagnostics()));

process.on("unhandledRejection", (reason) => {
  logFatal(reason);
});

process.on("uncaughtException", (error) => {
  logFatal(error);
  process.exit(1);
});

async function start() {
  const app = next(serverConfig);
  const handle = app.getRequestHandler();

  await app.prepare();

  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error("Server error:", error);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  }).listen(serverConfig.port, serverConfig.hostname, () => {
    console.log(
      `> Ready on http://${serverConfig.hostname}:${serverConfig.port} (appDir=${serverConfig.dir})`
    );
  });
}

start().catch((error) => {
  logFatal(error);
  process.exit(1);
});
