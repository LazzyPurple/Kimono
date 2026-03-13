"use client";

import { useEffect } from "react";

type ClientLogPayload = {
  source?: string;
  level: "warn" | "error";
  message: string;
  details?: Record<string, string | number | boolean | null | undefined>;
  pathname?: string;
};

const THROTTLE_MS = 5000;
const MAX_MESSAGE_LENGTH = 1000;

function clamp(value: string, maxLength = MAX_MESSAGE_LENGTH): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function formatArgument(value: unknown): string {
  if (value instanceof Error) {
    return clamp(value.stack ?? value.message);
  }

  if (typeof value === "string") {
    return clamp(value);
  }

  if (typeof value === "object" && value) {
    try {
      return clamp(JSON.stringify(value));
    } catch {
      return clamp(String(value));
    }
  }

  return clamp(String(value));
}

function createSignature(payload: ClientLogPayload): string {
  return `${payload.level}:${payload.message}:${payload.details?.kind ?? ""}:${payload.pathname ?? ""}`;
}

function sendClientLog(payload: ClientLogPayload) {
  const body = JSON.stringify({
    ...payload,
    pathname: payload.pathname ?? window.location.pathname,
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/logs", blob);
    return;
  }

  void fetch("/api/logs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
    keepalive: true,
  });
}

export default function BrowserErrorLogger() {
  useEffect(() => {
    const recent = new Map<string, number>();
    const originalError = console.error;
    const originalWarn = console.warn;

    const shouldSend = (payload: ClientLogPayload) => {
      if (!payload.message || payload.message.includes("/api/logs")) {
        return false;
      }

      const signature = createSignature(payload);
      const now = Date.now();
      const last = recent.get(signature) ?? 0;
      if (now - last < THROTTLE_MS) {
        return false;
      }

      recent.set(signature, now);
      return true;
    };

    const emit = (payload: ClientLogPayload) => {
      if (!shouldSend(payload)) {
        return;
      }

      sendClientLog(payload);
    };

    const handleWindowError = (event: ErrorEvent) => {
      emit({
        source: "client",
        level: "error",
        message: clamp(event.message || "Window error"),
        pathname: window.location.pathname,
        details: {
          kind: "window-error",
          filename: event.filename ?? null,
          lineno: event.lineno ?? null,
          colno: event.colno ?? null,
          stack: event.error instanceof Error ? clamp(event.error.stack ?? event.error.message) : null,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      emit({
        source: "client",
        level: "error",
        message: clamp(`Unhandled rejection: ${formatArgument(event.reason)}`),
        pathname: window.location.pathname,
        details: {
          kind: "unhandled-rejection",
        },
      });
    };

    console.error = (...args: unknown[]) => {
      emit({
        source: "client",
        level: "error",
        message: clamp(args.map(formatArgument).join(" ")),
        pathname: window.location.pathname,
        details: {
          kind: "console.error",
          title: document.title || null,
        },
      });
      originalError(...args);
    };

    console.warn = (...args: unknown[]) => {
      emit({
        source: "client",
        level: "warn",
        message: clamp(args.map(formatArgument).join(" ")),
        pathname: window.location.pathname,
        details: {
          kind: "console.warn",
          title: document.title || null,
        },
      });
      originalWarn(...args);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
