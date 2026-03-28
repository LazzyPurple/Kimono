"use client";

import { useState } from "react";

type AdminSessionButtonProps = {
  site: "kemono" | "coomer";
};

export function AdminSessionButton({ site }: AdminSessionButtonProps) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function disconnect() {
    if (!window.confirm(`Deconnecter la session ${site} ?`)) {
      return;
    }

    setState("pending");
    try {
      const response = await fetch(`/api/admin/sessions/${site}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("disconnect failed");
      }
      setState("done");
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={disconnect}
      disabled={state === "pending"}
      className="inline-flex h-10 items-center justify-center rounded-full border border-[#3b1f2b] bg-[#22131a] px-4 text-sm font-medium text-[#fda4af] transition hover:border-[#fb7185] hover:text-white disabled:cursor-wait disabled:opacity-60"
    >
      {state === "pending" ? "Deconnexion..." : "Deconnecter"}
    </button>
  );
}
