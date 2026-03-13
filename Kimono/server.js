const { createServer } = require("http");
const { parse } = require("url");
const { randomUUID } = require("crypto");
const { promises: fs } = require("fs");
const path = require("path");
const next = require("next");

const dev = false;
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const logPath = process.env.APP_LOG_PATH
  ? path.isAbsolute(process.env.APP_LOG_PATH)
    ? process.env.APP_LOG_PATH
    : path.resolve(process.cwd(), process.env.APP_LOG_PATH)
  : path.join(process.cwd(), "tmp", "app-debug.log");

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

process.on("uncaughtException", (error) => {
  void appendServerLog("error", "uncaught exception", {
    errorMessage: error?.message ?? "Unknown error",
    errorStack: error?.stack ? String(error.stack).split("\n").slice(0, 5).join(" | ") : null,
  });
  console.error("[server] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : null;
  void appendServerLog("error", "unhandled rejection", {
    errorMessage: message,
    errorStack: stack ? String(stack).split("\n").slice(0, 5).join(" | ") : null,
  });
  console.error("[server] Unhandled rejection:", reason);
});

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    void appendServerLog("info", "next server prepared", {
      hostname,
      port,
      nodeEnv: process.env.NODE_ENV ?? null,
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
        console.error("[server] Unhandled request error:", error);
        res.statusCode = 500;
        res.end("Internal server error");
      }
    }).listen(port, hostname, () => {
      void appendServerLog("info", "server listening", {
        hostname,
        port,
      });
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((error) => {
    void appendServerLog("error", "failed to prepare next server", {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack:
        error instanceof Error && error.stack
          ? error.stack.split("\n").slice(0, 5).join(" | ")
          : null,
    }).finally(() => {
      console.error("[server] Failed to prepare Next.js:", error);
      process.exit(1);
    });
  });
