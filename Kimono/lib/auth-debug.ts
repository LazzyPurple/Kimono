import path from "node:path";
import { promises as fs } from "node:fs";
import { appendAppLog } from "./app-logger.ts";
import { parseBooleanFlag } from "./local-dev-mode.ts";

const DEFAULT_AUTH_DEBUG_LOG = path.join("tmp", "auth-debug.log");
const DEFAULT_MAX_LOG_BYTES = 1024 * 1024;

type EnvShape = Record<string, string | undefined>;

type AuthDebugValue = string | number | boolean | null;

type AuthDebugDetails = Record<string, AuthDebugValue | undefined>;

function resolveAuthDebugLogLevel(event: string): "info" | "warn" | "error" {
  if (event.includes("error") || event.includes("db_")) {
    return "error";
  }

  if (event.includes("rejected") || event.includes("required")) {
    return "warn";
  }

  return "info";
}

export function shouldEnableAuthDebugLog(
  env: EnvShape = process.env
): boolean {
  return parseBooleanFlag(env.AUTH_DEBUG_LOG);
}

export function resolveAuthDebugLogPath(
  env: EnvShape = process.env,
  workspaceRoot = process.cwd()
): string {
  const configuredPath = env.AUTH_DEBUG_LOG_PATH?.trim();
  if (!configuredPath) {
    return path.join(workspaceRoot, DEFAULT_AUTH_DEBUG_LOG);
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(workspaceRoot, configuredPath);
}

export function toAuthDebugErrorDetails(error: unknown): AuthDebugDetails {
  if (!error) {
    return { errorMessage: "Unknown error" };
  }

  if (typeof error === "string") {
    return { errorMessage: error };
  }

  if (typeof error === "object") {
    const record = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      errno?: unknown;
      sqlState?: unknown;
      sqlMessage?: unknown;
      stack?: unknown;
    };

    return {
      errorName: typeof record.name === "string" ? record.name : undefined,
      errorMessage:
        typeof record.message === "string" ? record.message : "Unknown error",
      errorCode:
        typeof record.code === "string" || typeof record.code === "number"
          ? String(record.code)
          : undefined,
      errorErrno: typeof record.errno === "number" ? record.errno : undefined,
      errorSqlState:
        typeof record.sqlState === "string" ? record.sqlState : undefined,
      errorSqlMessage:
        typeof record.sqlMessage === "string" ? record.sqlMessage : undefined,
      errorStack:
        typeof record.stack === "string"
          ? record.stack.split("\n").slice(0, 3).join(" | ")
          : undefined,
    };
  }

  return { errorMessage: String(error) };
}

async function rotateAuthDebugLog(filePath: string, maxBytes: number) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size < maxBytes) {
      return;
    }

    await fs.rm(`${filePath}.1`, { force: true });
    await fs.rename(filePath, `${filePath}.1`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export async function appendAuthDebugLog(
  event: string,
  details: AuthDebugDetails = {},
  options?: {
    env?: EnvShape;
    workspaceRoot?: string;
    maxBytes?: number;
  }
): Promise<boolean> {
  const env = options?.env ?? process.env;

  await appendAppLog(
    {
      source: "auth",
      level: resolveAuthDebugLogLevel(event),
      message: event,
      details,
    },
    {
      env,
      workspaceRoot: options?.workspaceRoot,
    }
  );

  if (!shouldEnableAuthDebugLog(env)) {
    return false;
  }

  const filePath = resolveAuthDebugLogPath(env, options?.workspaceRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateAuthDebugLog(filePath, options?.maxBytes ?? DEFAULT_MAX_LOG_BYTES);

  const payload = Object.fromEntries(
    Object.entries({
      timestamp: new Date().toISOString(),
      event,
      ...details,
    }).filter(([, value]) => value !== undefined)
  );

  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  return true;
}
