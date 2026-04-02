import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentDiagnosticAccessDecision, shouldEnableDiagnosticBypass } from "@/lib/diagnostic-access";
import { getServerHealthPayload } from "@/lib/server-health";
import { DiagnosticsLocked, DiagnosticsPageShell, JsonCard, StatusPill } from "@/components/main/DiagnosticsPrimitives";

type SearchParams = {
  debugToken?: string | string[];
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const debugToken = getSingleValue(resolvedSearchParams.debugToken);
  const requestHeaders = await headers();
  const decision = await getCurrentDiagnosticAccessDecision({
    headers: requestHeaders,
    url: debugToken ? `http://kimono.local/health?debugToken=${encodeURIComponent(debugToken)}` : undefined,
  });
  const bypassEnabled = shouldEnableDiagnosticBypass();

  if (decision.type !== "allowed") {
    return <DiagnosticsLocked bypassEnabled={bypassEnabled} />;
  }

  const payload = await getServerHealthPayload();
  const dbOk = Boolean(payload.runtime?.database?.configured) && payload.runtime?.database?.driver === "mysql";

  return (
    <DiagnosticsPageShell
      eyebrow="Diagnostics"
      title="Health"
      description="Runtime health snapshot for the lune environment."
      actions={
        <>
          <StatusPill ok={dbOk} label={dbOk ? "db configured" : "db issue"} />
          <Link className="neo-button" href="/api/health">Health JSON</Link>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <JsonCard title="Runtime" value={payload.runtime} />
        <JsonCard title="Creator index" value={payload.creatorIndex} />
        <JsonCard title="Favorites" value={payload.favorites} />
        <JsonCard title="Media + previews" value={{ mediaSources: payload.mediaSources, previews: payload.previews }} />
      </div>
    </DiagnosticsPageShell>
  );
}
