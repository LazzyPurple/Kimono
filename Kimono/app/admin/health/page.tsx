import type { Metadata } from "next";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { requireAdminPageAccess } from "@/lib/admin/admin-access";
import { logAppError } from "@/lib/app-logger";
import { getServerHealthPayload } from "@/lib/server-health";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Health | Kimono",
  description: "Protected runtime health dashboard for Kimono.",
};

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  await requireAdminPageAccess("/admin/health", resolvedParams);

  try {
    const health = await getServerHealthPayload();

    return (
      <div className="space-y-5">
        <section className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Kimono Health</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Santé</h1>
          <p className="mt-3 text-sm leading-6 text-[#9ca3af]">
            Vue runtime sur la base, les cooldowns upstream, le catalogue createurs et les outils media.
          </p>
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
                <p>Creator catalog: <span className="text-white">{health.creatorIndex[site]?.total ?? 0}</span></p>
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
    );
  } catch (error) {
    await logAppError("admin", "Admin health page render failed", error, {
      details: { page: "/admin/health" },
    });
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}

