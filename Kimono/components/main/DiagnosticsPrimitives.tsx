import type { ReactNode } from "react";

export function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex border-2 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] ${ok ? "border-[#22c55e] text-[#22c55e]" : "border-[#ef4444] text-[#ef4444]"}`}>
      {label}
    </span>
  );
}

export function DiagnosticsPageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="mx-auto grid max-w-6xl gap-6">
        <div className="neo-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="neo-label mb-4">{eyebrow}</p>
              <h1 className="neo-heading mb-3">{title}</h1>
              <p className="max-w-3xl text-base leading-7 text-[#888888]">{description}</p>
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function DiagnosticsLocked({ bypassEnabled }: { bypassEnabled: boolean }) {
  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="neo-panel mx-auto max-w-5xl p-6 sm:p-10">
        <p className="neo-label mb-4">Diagnostics</p>
        <h1 className="neo-heading mb-6">Admin debug is locked</h1>
        <p className="max-w-3xl text-base leading-7 text-[#888888] sm:text-lg">
          For the lune, set <code className="border border-white px-2 py-1 text-white">AUTH_DEBUG_BYPASS=true</code> to unlock
          health, logs, and auth diagnostics without a working session.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="border-2 border-white bg-[#111111] p-5">
            <p className="neo-label mb-3">Current access</p>
            <StatusPill ok={false} label="locked" />
          </div>
          <div className="border-2 border-white bg-[#111111] p-5">
            <p className="neo-label mb-3">Bypass env</p>
            <StatusPill ok={bypassEnabled} label={bypassEnabled ? "enabled" : "disabled"} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function JsonCard({ title, value, danger = false }: { title: string; value: unknown; danger?: boolean }) {
  return (
    <div className="neo-panel p-6">
      <p className="neo-label mb-4">{title}</p>
      <pre className={`overflow-x-auto border-2 bg-[#111111] p-4 text-xs ${danger ? "border-[#ef4444] text-[#ef4444]" : "border-white text-[#f5f5f5]"}`}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
