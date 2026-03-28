import type { Metadata } from "next";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { requireAdminPageAccess } from "@/lib/admin/admin-access";
import { getAdminDashboardData } from "@/lib/admin/admin-dashboard";
import { formatBytes, formatDateTime, formatNumber, statusTone } from "@/lib/admin/admin-format";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Kimono",
  description: "Protected operator dashboard for Kimono.",
};

function toneForCooldowns(count: number) {
  if (count === 0) return "healthy" as const;
  if (count < 3) return "warn" as const;
  return "error" as const;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  await requireAdminPageAccess("/admin", resolvedParams);

  try {
    const dashboard = await getAdminDashboardData();

    const kpis = [
      { label: "Total creators Kemono", value: formatNumber(dashboard.health.creatorIndex.kemono?.total ?? 0) },
      { label: "Total creators Coomer", value: formatNumber(dashboard.health.creatorIndex.coomer?.total ?? 0) },
      { label: "Sessions actives", value: formatNumber(dashboard.sessions.length) },
      { label: "Previews generated", value: formatNumber(dashboard.health.previews.readyEntries) },
      { label: "Sources video en cache", value: formatNumber(dashboard.health.mediaSources.readyEntries) },
      { label: "Taille disque media", value: formatBytes(dashboard.disk.totalDiskBytes) },
    ];

    return (
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">{kpi.label}</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{kpi.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Etat des services</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Runtime critique</h3>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(toneForCooldowns(dashboard.health.upstreamCooldowns.length))}`}>
                {dashboard.health.upstreamCooldowns.length === 0 ? "Stable" : "Cooldowns actifs"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["DB driver", dashboard.serviceStatus.databaseDriver],
                ["ffmpeg", dashboard.serviceStatus.ffmpegStatus],
                ["ffprobe", dashboard.serviceStatus.ffprobeStatus],
                ["Boot sequence status", dashboard.serviceStatus.bootSequenceStatus],
                ["Refresh creator catalog", `${Math.round(dashboard.serviceStatus.creatorRefreshIntervalMs / 3_600_000)}h`],
                ["TOTP", dashboard.adminUser.totpEnabled ? "enabled" : "disabled"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-[#232336] bg-[#0b0b13] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b7280]">{label}</p>
                  <p className="mt-2 text-sm font-medium text-white">{value}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Derniere sync CreatorIndex</p>
            <div className="mt-4 space-y-3">
              {(["kemono", "coomer"] as const).map((site) => (
                <div key={site} className="rounded-2xl border border-[#232336] bg-[#0b0b13] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">{site}</span>
                    <span className="text-xs text-[#9ca3af]">{formatDateTime(dashboard.health.creatorIndex[site]?.syncedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#9ca3af]">
                    <span className="rounded-full bg-[#17172a] px-2 py-1 text-[#d1d5db]">{formatNumber(dashboard.health.creatorIndex[site]?.total ?? 0)} creators</span>
                    <span className={`rounded-full px-2 py-1 ${dashboard.health.creatorIndex[site]?.snapshotFresh ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                      {dashboard.health.creatorIndex[site]?.snapshotFresh ? "fresh" : "stale"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Cooldowns upstream</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {dashboard.health.upstreamCooldowns.length === 0 ? (
                <p className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Aucun cooldown actif</p>
              ) : dashboard.health.upstreamCooldowns.map((entry) => (
                <div key={`${entry.site}-${entry.bucket}`} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {entry.site} / {entry.bucket} - {Math.ceil(entry.retryAfterMs / 1000)}s
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#232336] bg-[#0b0b13] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b7280]">Preview disk</p>
                <p className="mt-2 text-sm font-medium text-white">{formatBytes(dashboard.disk.previewDiskBytes)}</p>
              </div>
              <div className="rounded-2xl border border-[#232336] bg-[#0b0b13] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b7280]">Media source disk</p>
                <p className="mt-2 text-sm font-medium text-white">{formatBytes(dashboard.disk.mediaDiskBytes)}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Alertes</p>
            <div className="mt-4 space-y-3">
              {dashboard.alerts.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                  Aucun signal bloquant detecte.
                </div>
              ) : dashboard.alerts.map((alert) => (
                <div key={alert.title} className={`rounded-2xl border px-4 py-4 text-sm ${statusTone(alert.level === "error" ? "error" : "warn")}`}>
                  <p className="font-medium">{alert.title}</p>
                  <p className="mt-2 leading-6 opacity-90">{alert.message}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  } catch (error) {
    await logAppError("admin", "Admin page render failed", error, {
      details: { page: "/admin" },
    });
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}

