import { appendAppLog, readAppLogs } from "./app-logger.ts";

export async function getLogsRoutePayload(url: string) {
  const parsedUrl = new URL(url);
  const source = parsedUrl.searchParams.get("source");
  const level = parsedUrl.searchParams.get("level") as "debug" | "info" | "warn" | "error" | null;
  const query = parsedUrl.searchParams.get("q");
  const limit = Math.max(1, Math.min(500, Number(parsedUrl.searchParams.get("limit") ?? "200") || 200));

  const logs = await readAppLogs({
    source,
    level,
    query,
    limit,
  });

  return {
    ok: true,
    logs,
    filters: {
      source,
      level,
      q: query,
      limit,
    },
  };
}

export async function ingestLogsRoutePayload(body: unknown) {
  const payload = typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const nestedDetails =
    typeof payload.details === "object" && payload.details
      ? (payload.details as Record<string, unknown>)
      : null;
  const pathname =
    typeof payload.pathname === "string"
      ? payload.pathname
      : typeof nestedDetails?.pathname === "string"
        ? nestedDetails.pathname
        : undefined;

  const entry = await appendAppLog({
    source: typeof payload.source === "string" ? payload.source : "client",
    level:
      payload.level === "debug" ||
      payload.level === "info" ||
      payload.level === "warn" ||
      payload.level === "error"
        ? payload.level
        : "error",
    message: typeof payload.message === "string" ? payload.message : "Client log event",
    details: nestedDetails
      ? {
          ...nestedDetails,
          pathname,
        }
      : {
          pathname,
        },
  });

  return {
    ok: true,
    entry,
  };
}
