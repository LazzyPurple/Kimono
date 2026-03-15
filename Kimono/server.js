const { createServer } = require("http");
const { parse } = require("url");
const { randomUUID } = require("crypto");
const { promises: fs } = require("fs");
const path = require("path");
const next = require("next");
const {
  buildServerConfig,
  collectStartupDiagnostics,
  formatFatalStartupError,
  formatStartupDiagnostics,
  loadRuntimeEnv,
} = require("./lib/server/startup.cjs");

const entryDir = __dirname;
const loadedEnvFiles = loadRuntimeEnv({ appDir: entryDir, env: process.env });
const serverConfig = buildServerConfig({ entryDir, env: process.env });
const logPath = process.env.APP_LOG_PATH
  ? path.isAbsolute(process.env.APP_LOG_PATH)
    ? process.env.APP_LOG_PATH
    : path.resolve(process.cwd(), process.env.APP_LOG_PATH)
  : path.join(process.cwd(), "tmp", "app-debug.log");

function currentDiagnostics() {
  return collectStartupDiagnostics({
    appDir: entryDir,
    cwd: process.cwd(),
    env: process.env,
  });
}

async function appendServerLog(level, message, details = {}) {
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const entry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: "server",
      level,
      message,
      details,
    };
    await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("[server] Failed to persist structured log:", error);
  }
}

function logFatal(error) {
  const diagnostics = currentDiagnostics();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : null;

  void appendServerLog("error", "fatal startup error", {
    errorMessage: message,
    errorStack: stack ? String(stack).split("\n").slice(0, 5).join(" | ") : null,
    diagnostics,
  });

  console.error(formatFatalStartupError(error, diagnostics));
}

if (loadedEnvFiles.length > 0) {
  console.log(`[BOOT] Loaded env files: ${loadedEnvFiles.join(", ")}`);
}

console.log(formatStartupDiagnostics(currentDiagnostics()));

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : null;

  void appendServerLog("error", "unhandled rejection", {
    errorMessage: message,
    errorStack: stack ? String(stack).split("\n").slice(0, 5).join(" | ") : null,
  });

  logFatal(reason);
});

process.on("uncaughtException", (error) => {
  void appendServerLog("error", "uncaught exception", {
    errorMessage: error?.message ?? "Unknown error",
    errorStack: error?.stack ? String(error.stack).split("\n").slice(0, 5).join(" | ") : null,
  });

  logFatal(error);
  process.exit(1);
});

async function start() {
  const app = next(serverConfig);
  const handle = app.getRequestHandler();

  await app.prepare();
  await appendServerLog("info", "next server prepared", {
    hostname: serverConfig.hostname,
    port: serverConfig.port,
    nodeEnv: process.env.NODE_ENV ?? null,
    dir: serverConfig.dir,
  });

  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      void appendServerLog("error", "unhandled request error", {
        method: req.method ?? null,
        url: req.url ?? null,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack:
          error instanceof Error && error.stack
            ? error.stack.split("\n").slice(0, 5).join(" | ")
            : null,
      });
      console.error("Server error:", error);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  }).listen(serverConfig.port, serverConfig.hostname, () => {
    void appendServerLog("info", "server listening", {
      hostname: serverConfig.hostname,
      port: serverConfig.port,
      dir: serverConfig.dir,
    });
    console.log(
      `> Ready on http://${serverConfig.hostname}:${serverConfig.port} (appDir=${serverConfig.dir})`
    );
  });
}

start().catch((error) => {
  logFatal(error);
  process.exit(1);
});
