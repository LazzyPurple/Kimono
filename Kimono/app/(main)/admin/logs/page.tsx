import type { Metadata } from "next";
import Link from "next/link";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { JsonCard, StatusPill } from "@/components/main/DiagnosticsPrimitives";
import { logAppError } from "@/lib/app-logger";
import { getLogsDashboardData } from "@/lib/logs-dashboard";
import { getServerHealthPayload } from "@/lib/server-health";

export const metadata: Metadata = {
  title: "Admin Logs | Kimono",
};

type SearchParams = {
  source?: string | string[];
  level?: string | string[];
  q?: string | string[];
  limit?: string | string[];
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function withQuery(basePath: string, query: Record<string, string | undefined>) {
  const url = new URL(`http://kimono.local${basePath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  try {
    const resolvedSearchParams = await searchParams;
    const source = getSingleValue(resolvedSearchParams.source);
    const level = getSingleValue(resolvedSearchParams.level);
    const q = getSingleValue(resolvedSearchParams.q);
    const limit = getSingleValue(resolvedSearchParams.limit) ?? "200";

    const [dashboard, health] = await Promise.all([
      getLogsDashboardData({
        url: withQuery("/api/logs", { source, level, q, limit }),
      }),
      getServerHealthPayload(),
    ]);

    const runtimeProbe = {
      mode: process.env.NODE_ENV ?? "unknown",
      credentialAuthEnabled: dashboard.auth.credentialAuthEnabled,
      databaseScheme: health.runtime.database.driver,
      authSecretConfigured: dashboard.auth.env.authSecretConfigured,
    };

    return (
      <>
        <div className="neo-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="neo-label mb-4">Logs</p>
              <h1 className="neo-heading mb-3">Runtime journal</h1>
              <p className="max-w-3xl text-base leading-7 text-[#888888]">
                Probe runtime, payloads sanitises et journal structure exportable en JSON.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusPill ok={runtimeProbe.databaseScheme === "postgres"} label={`database ${runtimeProbe.databaseScheme ?? "unknown"}`} />
              <StatusPill ok={runtimeProbe.credentialAuthEnabled} label={runtimeProbe.credentialAuthEnabled ? "credential auth on" : "credential auth off"} />
              <Link className="neo-button" href={withQuery("/api/logs?format=json", { source, level, q, limit })}>Export JSON</Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <JsonCard title="Runtime probe" value={runtimeProbe} />
          <JsonCard title="Sanitized auth payload" value={dashboard.auth} danger={!dashboard.auth.database.ok} />
        </div>

        <div className="neo-panel p-6">
          <p className="neo-label mb-4">Filters</p>
          <div className="flex flex-wrap gap-3 text-sm text-[#888888]">
            <span className="border-2 border-white bg-[#111111] px-3 py-2">source: {source ?? "all"}</span>
            <span className="border-2 border-white bg-[#111111] px-3 py-2">level: {level ?? "all"}</span>
            <span className="border-2 border-white bg-[#111111] px-3 py-2">q: {q ?? "none"}</span>
            <span className="border-2 border-white bg-[#111111] px-3 py-2">limit: {limit}</span>
          </div>
        </div>

        <div className="grid gap-6">
          {dashboard.logs.logs.map((entry) => (
            <div key={entry.id} className="neo-panel p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                <span className={`inline-flex border-2 px-3 py-1 font-black uppercase tracking-[0.2em] ${entry.level === "error" ? "border-[#ef4444] text-[#ef4444]" : entry.level === "warn" ? "border-[#f59e0b] text-[#f59e0b]" : "border-[#22c55e] text-[#22c55e]"}`}>{entry.level}</span>
                <span className="inline-flex border-2 border-white px-3 py-1 font-black uppercase tracking-[0.2em] text-white">{entry.source}</span>
                <span className="text-[#888888]">{new Date(entry.timestamp).toLocaleString("fr-FR")}</span>
                <span className="ml-auto text-xs text-[#666666]">{entry.id}</span>
              </div>
              <p className="mb-4 text-lg font-black uppercase tracking-[0.08em] text-white">{entry.message}</p>
              <pre className="overflow-x-auto border-2 border-white bg-[#111111] p-4 text-xs text-[#f5f5f5]">{JSON.stringify(entry.details ?? {}, null, 2)}</pre>
            </div>
          ))}

          {dashboard.logs.logs.length === 0 ? (
            <div className="neo-panel p-6 text-base text-[#888888]">No runtime logs for this filter.</div>
          ) : null}
        </div>
      </>
    );
  } catch (error) {
    await logAppError("admin-logs", "Failed to render admin logs page", error);
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}
