import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentDiagnosticAccessDecision } from "@/lib/diagnostic-access";
import { getServerHealthPayload } from "@/lib/server-health";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Health | Kimono",
  description: "Protected runtime health dashboard for Kimono.",
};

type SearchParamValue = string | string[] | undefined;

function firstParam(value: SearchParamValue): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const debugToken = firstParam(resolvedParams.debugToken);
  const accessParams = new URLSearchParams();
  if (debugToken) {
    accessParams.set("debugToken", debugToken);
  }

  const requestHeaders = await headers();
  const currentUrl = `http://localhost/health?${accessParams.toString()}`;
  const accessDecision = await getCurrentDiagnosticAccessDecision({
    headers: requestHeaders,
    url: currentUrl,
  });

  if (accessDecision.type !== "allowed") {
    if (debugToken) {
      notFound();
    }
    redirect(`/login?callbackUrl=${encodeURIComponent("/health")}`);
  }

  const health = await getServerHealthPayload();
  const rawJsonHref = accessParams.size > 0 ? `/api/health?${accessParams.toString()}` : "/api/health";
  const logsHref = accessParams.size > 0 ? `/logs?${accessParams.toString()}` : "/logs";

  return (
    <main className="min-h-screen bg-[#05050a] px-3 py-5 text-[#f0f0f5] sm:px-5 sm:py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-4 lg:space-y-5">
        <section className="rounded-[28px] border border-[#1e1e2e] bg-[linear-gradient(135deg,rgba(16,16,26,0.98),rgba(12,12,20,0.94))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.34em] text-[#8b5cf6]">Kimono Health</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">Server health</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ca3af] sm:text-[15px]">
                Vue de sante runtime pour les snapshots, les cooldowns upstream et les dependances serveur critiques.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link href={logsHref} className="inline-flex h-11 items-center justify-center rounded-full border border-[#232336] px-5 text-sm font-medium text-[#d1d5db] transition hover:border-[#4c1d95] hover:bg-[#17172a] hover:text-white">
                Logs
              </Link>
              <Link href={rawJsonHref} className="inline-flex h-11 items-center justify-center rounded-full border border-[#312e81] px-5 text-sm font-medium text-[#d9ccff] transition hover:border-[#4c1d95] hover:bg-[#17172a] hover:text-white">
                Raw JSON
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b5cf6]">Runtime</p>
            <div className="mt-3 space-y-2 text-sm text-[#d1d5db]">
              <p>Database: <span className="text-white">{health.runtime.database.driver ?? "unknown"}</span></p>
              <p>Session store: <span className="text-white">{health.runtime.sessionStore.mode}</span></p>
              <p>FFmpeg: <span className="text-white">{health.runtime.previewTools.ffmpeg.status}</span></p>
              <p>FFprobe: <span className="text-white">{health.runtime.previewTools.ffprobe.status}</span></p>
            </div>
          </article>

          <article className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-4 lg:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b5cf6]">Cooldowns upstream</p>
            <div className="mt-3 space-y-2 text-sm text-[#d1d5db]">
              {health.upstreamCooldowns.length === 0 ? (
                <p className="text-[#9ca3af]">Aucun cooldown actif.</p>
              ) : health.upstreamCooldowns.map((entry) => (
                <div key={`${entry.site}-${entry.bucket}`} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#232336] bg-[#0b0b13] px-3 py-2">
                  <span className="rounded-full bg-[#17172a] px-2 py-1 text-xs uppercase tracking-[0.18em] text-[#c4b5fd]">{entry.site}</span>
                  <span className="rounded-full bg-[#22131a] px-2 py-1 text-xs uppercase tracking-[0.18em] text-[#f9a8d4]">{entry.bucket}</span>
                  <span>{Math.ceil(entry.retryAfterMs / 1000)}s restantes</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {(["kemono", "coomer"] as const).map((site) => (
            <article key={site} className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b5cf6]">{site}</p>
              <div className="mt-3 space-y-2 text-sm text-[#d1d5db]">
                <p>Creator index: <span className="text-white">{health.creatorIndex[site]?.total ?? 0}</span></p>
                <p>Snapshot fresh: <span className="text-white">{health.creatorIndex[site]?.snapshotFresh ? "yes" : "no"}</span></p>
                <p>Synced at: <span className="text-white">{health.creatorIndex[site]?.syncedAt ?? "never"}</span></p>
                <p>Favorite creators: <span className="text-white">{health.favorites[site]?.creators ?? 0}</span></p>
                <p>Favorite posts: <span className="text-white">{health.favorites[site]?.posts ?? 0}</span></p>
              </div>
            </article>
          ))}

          <article className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b5cf6]">Discover cache</p>
            <div className="mt-3 space-y-2 text-sm text-[#d1d5db]">
              <p>Cached: <span className="text-white">{health.discovery.cached ? "yes" : "no"}</span></p>
              <p>Total items: <span className="text-white">{health.discovery.total}</span></p>
              <p>Updated at: <span className="text-white">{health.discovery.updatedAt ?? "never"}</span></p>
              <p>Generated at: <span className="text-white">{health.generatedAt}</span></p>
            </div>
          </article>
        </section>

        <section className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b5cf6]">Payload</p>
          <pre className="mt-4 max-h-[32rem] overflow-auto rounded-2xl border border-[#1d1d2b] bg-[#09090f] p-4 text-xs leading-6 text-[#d1d5db]">
            {JSON.stringify(health, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
