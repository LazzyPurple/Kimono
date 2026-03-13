import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";

const DEFAULT_APP_LOG_PATH = path.join("tmp", "app-debug.log");
const DEFAULT_MAX_LOG_BYTES = 1024 * 1024;
const DEFAULT_READ_LIMIT = 200;
const MAX_STRING_LENGTH = 1200;
const MAX_QUERY_LENGTH = 120;

export type AppLogLevel = "debug" | "info" | "warn" | "error";
export type AppLogValue = string | number | boolean | null;
export type AppLogDetails = Record<string, AppLogValue>;

export type AppLogEntry = {
  id: string;
  timestamp: string;
  source: string;
  level: AppLogLevel;
  message: string;
  details?: AppLogDetails;
};

type EnvShape = Record<string, string | undefined>;

type AppendAppLogInput = {
  source: string;
  level: AppLogLevel;
  message: string;
  details?: Record<string, unknown>;
};

type ReadAppLogsOptions = {
  env?: EnvShape;
  workspaceRoot?: string;
  limit?: number;
  source?: string | null;
  level?: AppLogLevel | null;
  query?: string | null;
};

function clampString(value: string, maxLength = MAX_STRING_LENGTH): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function normalizeLevel(level: string | null | undefined): AppLogLevel {
  return level === "debug" || level === "info" || level === "warn" || level === "error"
    ? level
    : "info";
}

function normalizeSource(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase();
  return normalized ? clampString(normalized, 64) : "app";
}

function normalizeMessage(message: string | null | undefined): string {
  const normalized = message?.trim();
  return normalized ? clampString(normalized) : "Unknown log event";
}

function sanitizeDetailValue(value: unknown): AppLogValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return clampString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return clampString(value.stack ?? value.message);
  }

  if (typeof value === "object") {
    try {
      return clampString(JSON.stringify(value));
    } catch {
      return clampString(String(value));
    }
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  return value === undefined ? undefined : clampString(String(value));
}

function sanitizeDetails(details?: Record<string, unknown>): AppLogDetails | undefined {
  if (!details) {
    return undefined;
  }

  const entries = Object.entries(details)
    .map(([key, value]) => {
      const sanitizedValue = sanitizeDetailValue(value);
      return sanitizedValue === undefined
        ? null
        : [clampString(key, 64), sanitizedValue] as const;
    })
    .filter((entry): entry is readonly [string, AppLogValue] => Boolean(entry));

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export function resolveAppLogPath(
  env: EnvShape = process.env,
  workspaceRoot = process.cwd()
): string {
  const configuredPath = env.APP_LOG_PATH?.trim();
  if (!configuredPath) {
    return path.join(workspaceRoot, DEFAULT_APP_LOG_PATH);
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(workspaceRoot, configuredPath);
}

async function rotateAppLog(filePath: string, maxBytes: number) {
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

function createLogEntry(
  input: AppendAppLogInput,
  now = new Date()
): AppLogEntry {
  return {
    id: randomUUID(),
    timestamp: now.toISOString(),
    source: normalizeSource(input.source),
    level: normalizeLevel(input.level),
    message: normalizeMessage(input.message),
    details: sanitizeDetails(input.details),
  };
}

export function toAppLogErrorDetails(error: unknown): AppLogDetails {
  if (!error) {
    return { errorMessage: "Unknown error" };
  }

  if (typeof error === "string") {
    return { errorMessage: clampString(error) };
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
      status?: unknown;
      response?: { status?: unknown; statusText?: unknown };
    };

    return {
      errorName: typeof record.name === "string" ? clampString(record.name) : null,
      errorMessage:
        typeof record.message === "string" ? clampString(record.message) : "Unknown error",
      errorCode:
        typeof record.code === "string" || typeof record.code === "number"
          ? clampString(String(record.code), 128)
          : null,
      errorErrno: typeof record.errno === "number" ? record.errno : null,
      errorSqlState: typeof record.sqlState === "string" ? clampString(record.sqlState, 64) : null,
      errorSqlMessage:
        typeof record.sqlMessage === "string" ? clampString(record.sqlMessage) : null,
      errorStatus: typeof record.status === "number" ? record.status : null,
      errorResponseStatus:
        typeof record.response?.status === "number" ? record.response.status : null,
      errorResponseStatusText:
        typeof record.response?.statusText === "string"
          ? clampString(record.response.statusText)
          : null,
      errorStack:
        typeof record.stack === "string"
          ? clampString(record.stack.split("\n").slice(0, 5).join(" | "))
          : null,
    };
  }

  return { errorMessage: clampString(String(error)) };
}

export async function appendAppLog(
  input: AppendAppLogInput,
  options?: {
    env?: EnvShape;
    workspaceRoot?: string;
    maxBytes?: number;
    now?: Date;
  }
): Promise<AppLogEntry> {
  const filePath = resolveAppLogPath(options?.env ?? process.env, options?.workspaceRoot);
  const entry = createLogEntry(input, options?.now);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateAppLog(filePath, options?.maxBytes ?? DEFAULT_MAX_LOG_BYTES);
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");

  return entry;
}

export async function logAppError(
  source: string,
  message: string,
  error: unknown,
  options?: {
    env?: EnvShape;
    workspaceRoot?: string;
    details?: Record<string, unknown>;
  }
): Promise<AppLogEntry> {
  return appendAppLog(
    {
      source,
      level: "error",
      message,
      details: {
        ...options?.details,
        ...toAppLogErrorDetails(error),
      },
    },
    {
      env: options?.env,
      workspaceRoot: options?.workspaceRoot,
    }
  );
}

function parseLogLine(line: string): AppLogEntry | null {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as Partial<AppLogEntry> & {
      details?: Record<string, unknown>;
    };

    if (
      typeof parsed.timestamp !== "string" ||
      typeof parsed.source !== "string" ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }

    return {
      id: typeof parsed.id === "string" && parsed.id ? parsed.id : randomUUID(),
      timestamp: parsed.timestamp,
      source: normalizeSource(parsed.source),
      level: normalizeLevel(parsed.level),
      message: normalizeMessage(parsed.message),
      details: sanitizeDetails(parsed.details),
    };
  } catch {
    return null;
  }
}

export async function readAppLogs(options: ReadAppLogsOptions = {}): Promise<AppLogEntry[]> {
  const filePath = resolveAppLogPath(options.env ?? process.env, options.workspaceRoot);
  let contents = "";

  try {
    contents = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const normalizedQuery = options.query?.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH);
  const normalizedSource = options.source ? normalizeSource(options.source) : null;
  const normalizedLevel = options.level ? normalizeLevel(options.level) : null;
  const limit = Math.max(1, Math.min(500, options.limit ?? DEFAULT_READ_LIMIT));

  return contents
    .split(/\r?\n/)
    .map(parseLogLine)
    .filter((entry): entry is AppLogEntry => Boolean(entry))
    .reverse()
    .filter((entry) => {
      if (normalizedSource && entry.source !== normalizedSource) {
        return false;
      }

      if (normalizedLevel && entry.level !== normalizedLevel) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${entry.message} ${JSON.stringify(entry.details ?? {})}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .slice(0, limit);
}
