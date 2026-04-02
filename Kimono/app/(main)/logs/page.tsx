import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentDiagnosticAccessDecision, shouldEnableDiagnosticBypass } from "@/lib/diagnostic-access";
import { getLogsRoutePayload } from "@/lib/logs-route";
import { DiagnosticsLocked, DiagnosticsPageShell, StatusPill } from "@/components/main/DiagnosticsPrimitives";

type SearchParams = {
  debugToken?: string | string[];
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

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const debugToken = getSingleValue(resolvedSearchParams.debugToken);
  const requestHeaders = await headers();
  const decision = await getCurrentDiagnosticAccessDecision({
    headers: requestHeaders,
    url: debugToken ? `http://kimono.local/logs?debugToken=${encodeURIComponent(debugToken)}` : undefined,
  });
  const bypassEnabled = shouldEnableDiagnosticBypass();

  if (decision.type !== "allowed") {
    return <DiagnosticsLocked bypassEnabled={bypassEnabled} />;
  }

  const source = getSingleValue(resolvedSearchParams.source);
  const level = getSingleValue(resolvedSearchParams.level);
  const q = getSingleValue(resolvedSearchParams.q);
  const limit = getSingleValue(resolvedSearchParams.limit) ?? "200";
  const payload = await getLogsRoutePayload(withQuery("/api/logs", { source, level, q, limit }));

  return (
    <DiagnosticsPageShell
      eyebrow="Diagnostics"
      title="Logs"
      description="Structured server and auth logs for the lune environment."
      actions={
        <>
          <StatusPill ok label={`${payload.logs.length} entries`} />
          <Link className="neo-button" href={withQuery('/api/logs?format=json', { source, level, q, limit })}>Export JSON</Link>
        </>
      }
    >
      <div className="neo-panel p-6">
        <p className="neo-label mb-4">Filters</p>
        <div className="flex flex-wrap gap-3 text-sm text-[#888888]">
          <span className="border-2 border-white bg-[#111111] px-3 py-2">source: {source ?? 'all'}</span>
          <span className="border-2 border-white bg-[#111111] px-3 py-2">level: {level ?? 'all'}</span>
          <span className="border-2 border-white bg-[#111111] px-3 py-2">q: {q ?? 'none'}</span>
          <span className="border-2 border-white bg-[#111111] px-3 py-2">limit: {limit}</span>
        </div>
      </div>

      <div className="grid gap-6">
        {payload.logs.map((entry) => (
          <div key={entry.id} className="neo-panel p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span className={`inline-flex border-2 px-3 py-1 font-black uppercase tracking-[0.2em] ${entry.level === 'error' ? 'border-[#ef4444] text-[#ef4444]' : entry.level === 'warn' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-[#22c55e] text-[#22c55e]'}`}>{entry.level}</span>
              <span className="inline-flex border-2 border-white px-3 py-1 font-black uppercase tracking-[0.2em] text-white">{entry.source}</span>
              <span className="text-[#888888]">{new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
              <span className="ml-auto text-xs text-[#666666]">{entry.id}</span>
            </div>
            <p className="mb-4 text-lg font-black uppercase tracking-[0.08em] text-white">{entry.message}</p>
            <pre className="overflow-x-auto border-2 border-white bg-[#111111] p-4 text-xs text-[#f5f5f5]">{JSON.stringify(entry.details ?? {}, null, 2)}</pre>
          </div>
        ))}
      </div>
    </DiagnosticsPageShell>
  );
}
