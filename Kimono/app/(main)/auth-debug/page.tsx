import Link from "next/link";
import { headers } from "next/headers";
import { collectAuthDebugSnapshot } from "@/lib/auth-debug-route";
import { getCurrentDiagnosticAccessDecision, shouldEnableDiagnosticBypass } from "@/lib/diagnostic-access";
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
    url: debugToken ? `http://kimono.local/auth-debug?debugToken=${encodeURIComponent(debugToken)}` : undefined,
  });
  const bypassEnabled = shouldEnableDiagnosticBypass();

  if (decision.type !== "allowed") {
    return <DiagnosticsLocked bypassEnabled={bypassEnabled} />;
  }

  const auth = await collectAuthDebugSnapshot();

  return (
    <DiagnosticsPageShell
      eyebrow="Diagnostics"
      title="Auth debug"
      description="Focused auth snapshot to diagnose password login failures on the lune."
      actions={
        <>
          <StatusPill ok={auth.credentialAuthEnabled} label={auth.credentialAuthEnabled ? "credentials on" : "credentials off"} />
          <Link className="neo-button" href="/api/auth/debug">Auth debug JSON</Link>
        </>
      }
    >
      <div className="grid gap-6">
        <JsonCard title="Database auth snapshot" value={auth} danger={!auth.database.ok} />
      </div>
    </DiagnosticsPageShell>
  );
}
