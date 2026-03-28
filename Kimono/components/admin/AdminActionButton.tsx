"use client";

import { useState } from "react";

type AdminActionButtonProps = {
  action: string;
  label: string;
  description: string;
  body?: Record<string, unknown>;
  confirmMessage?: string;
};

type ActionState =
  | { status: "idle"; message: null }
  | { status: "pending"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function AdminActionButton({
  action,
  label,
  description,
  body,
  confirmMessage,
}: AdminActionButtonProps) {
  const [state, setState] = useState<ActionState>({ status: "idle", message: null });

  async function runAction() {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setState({ status: "pending", message: "Execution en cours..." });

    try {
      const response = await fetch(action, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Action failed");
      }

      setState({
        status: "success",
        message: typeof payload?.message === "string" ? payload.message : "Action terminee.",
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    }
  }

  return (
    <div className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">{label}</h3>
          <p className="max-w-2xl text-sm leading-6 text-[#9ca3af]">{description}</p>
        </div>
        <button
          type="button"
          onClick={runAction}
          disabled={state.status === "pending"}
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#7c3aed] bg-[#6d28d9] px-5 text-sm font-medium text-white transition hover:bg-[#7c3aed] disabled:cursor-wait disabled:opacity-60"
        >
          {state.status === "pending" ? "Execution..." : label}
        </button>
      </div>

      {state.message ? (
        <p
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            state.status === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : state.status === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-[#232336] bg-[#0b0b13] text-[#d1d5db]"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
