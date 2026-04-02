import Link from "next/link";
import { headers } from "next/headers";
import { collectAuthDebugSnapshot, collectPublicRuntimeEnvProbe } from "@/lib/auth-debug-route";
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
    url: debugToken ? `http://kimono.local/admin?debugToken=${encodeURIComponent(debugToken)}` : undefined,
  });

  const bypassEnabled = shouldEnableDiagnosticBypass();
  if (decision.type !== "allowed") {
    return <DiagnosticsLocked bypassEnabled={bypassEnabled} />;
  }

  const runtime = collectPublicRuntimeEnvProbe();
  const auth = await collectAuthDebugSnapshot();

  return (
    <DiagnosticsPageShell
      eyebrow="Diagnostics"
      title="Admin debug console"
      description="Temporary lune diagnostics for auth, runtime, health, and logs while the new shell is stabilizing."
      actions={
        <>
          <StatusPill ok label={`access ${decision.via}`} />
          <StatusPill ok={bypassEnabled} label={bypassEnabled ? "bypass on" : "bypass off"} />
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="neo-panel p-6">
          <p className="neo-label mb-4">Runtime auth</p>
          <div className="grid gap-3 text-sm text-[#888888]">
            <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>Credential auth</span><StatusPill ok={runtime.credentialAuthEnabled} label={runtime.credentialAuthEnabled ? "enabled" : "disabled"} /></div>
            <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>Admin password configured</span><StatusPill ok={runtime.env.adminPasswordConfigured} label={runtime.env.adminPasswordConfigured ? "present" : "missing"} /></div>
            <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>AUTH_SECRET configured</span><StatusPill ok={runtime.env.authSecretConfigured} label={runtime.env.authSecretConfigured ? "present" : "missing"} /></div>
            <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>AUTH_URL configured</span><StatusPill ok={runtime.env.authUrlConfigured} label={runtime.env.authUrlConfigured ? "present" : "missing"} /></div>
            <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>Auth debug log</span><StatusPill ok={runtime.env.authDebugLogEnabled} label={runtime.env.authDebugLogEnabled ? "enabled" : "disabled"} /></div>
          </div>
        </div>

        <div className="neo-panel p-6">
          <p className="neo-label mb-4">Database auth state</p>
          <div className="grid gap-3 text-sm text-[#888888]">
            <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>DB probe</span><StatusPill ok={auth.database.ok} label={auth.database.ok ? "ok" : "failed"} /></div>
            {auth.database.ok ? (
              <>
                <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>Admin user exists</span><StatusPill ok={auth.database.adminUser.exists} label={auth.database.adminUser.exists ? "yes" : "no"} /></div>
                <div className="flex items-center justify-between border-2 border-white bg-[#111111] px-4 py-3"><span>TOTP enabled</span><StatusPill ok={auth.database.adminUser.totpEnabled} label={auth.database.adminUser.totpEnabled ? "yes" : "no"} /></div>
              </>
            ) : (
              <pre className="overflow-x-auto border-2 border-[#ef4444] bg-[#111111] p-4 text-xs text-[#ef4444]">{JSON.stringify(auth.database.error, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>

      <div className="neo-panel p-6">
        <p className="neo-label mb-4">Diagnostics pages</p>
        <div className="flex flex-wrap gap-3">
          <Link className="neo-button" href="/health">Health</Link>
          <Link className="neo-button" href="/logs">Logs</Link>
          <Link className="neo-button" href="/auth-debug">Auth debug</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <JsonCard title="Runtime" value={runtime} />
        <JsonCard title="Auth snapshot" value={auth} danger={!auth.database.ok} />
      </div>
    </DiagnosticsPageShell>
  );
}
