import type { Metadata } from "next";
import Link from "next/link";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { StatusPill } from "@/components/main/DiagnosticsPrimitives";
import { getAdminDashboardData } from "@/lib/admin/admin-dashboard";
import { logAppError } from "@/lib/app-logger";

export const metadata: Metadata = {
  title: "Admin Dashboard | Kimono",
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="neo-panel p-5">
      <p className="neo-label mb-3">{label}</p>
      <p className="text-4xl font-black uppercase tracking-[0.08em] text-white">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  try {
    const snapshot = await getAdminDashboardData();

    return (
      <>
        <div className="neo-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="neo-label mb-4">Dashboard</p>
              <h1 className="neo-heading mb-3">Admin cockpit</h1>
              <p className="max-w-3xl text-base leading-7 text-[#888888]">
                Vue server-first du runtime, des catalogues Creator, des caches media et des operations manuelles.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusPill ok={snapshot.runtime.databaseDriver === "postgres"} label={`database ${snapshot.runtime.databaseDriver ?? "unknown"}`} />
              <StatusPill ok={snapshot.upstreamCooldowns.length === 0} label={snapshot.upstreamCooldowns.length === 0 ? "no cooldown" : "cooldown active"} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Total creators Kemono" value={snapshot.cards.kemonoCreators.toLocaleString("fr-FR")} />
          <MetricCard label="Total creators Coomer" value={snapshot.cards.coomerCreators.toLocaleString("fr-FR")} />
          <MetricCard label="Sessions actives" value={snapshot.cards.activeSessions.toLocaleString("fr-FR")} />
          <MetricCard label="Previews generees" value={snapshot.cards.generatedPreviews.toLocaleString("fr-FR")} />
          <MetricCard label="Sources video en cache" value={snapshot.cards.cachedVideoSources.toLocaleString("fr-FR")} />
          <MetricCard label="Taille disque media" value={formatBytes(snapshot.cards.mediaDiskBytes)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
          <div className="neo-panel p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="neo-label mb-2">Etat des services</p>
                <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-white">Runtime critique</h2>
              </div>
              <StatusPill ok={snapshot.upstreamCooldowns.length === 0} label={snapshot.upstreamCooldowns.length === 0 ? "stable" : "degraded"} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">DB driver</p>
                <p className="text-lg font-black uppercase tracking-[0.08em] text-white">{snapshot.runtime.databaseDriver ?? "unknown"}</p>
              </div>
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">FFmpeg</p>
                <p className="text-lg font-black uppercase tracking-[0.08em] text-white">{snapshot.runtime.ffmpegStatus ?? "unknown"}</p>
              </div>
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">FFprobe</p>
                <p className="text-lg font-black uppercase tracking-[0.08em] text-white">{snapshot.runtime.ffprobeStatus ?? "unknown"}</p>
              </div>
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">Boot policy</p>
                <p className="text-lg font-black uppercase tracking-[0.08em] text-white">{snapshot.bootPolicy}</p>
              </div>
            </div>
          </div>

          <div className="neo-panel p-6">
            <p className="neo-label mb-4">Derniere sync CreatorIndex</p>
            <div className="grid gap-4">
              {Object.entries(snapshot.creatorSync).map(([site, value]) => (
                <div key={site} className="border-2 border-white bg-[#111111] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xl font-black uppercase tracking-[0.08em] text-white">{site}</p>
                    <StatusPill ok={value.snapshotFresh} label={value.snapshotFresh ? "fresh" : "stale"} />
                  </div>
                  <p className="mt-2 text-sm text-[#888888]">{value.total.toLocaleString("fr-FR")} creators</p>
                  <p className="mt-1 text-xs text-[#666666]">{value.syncedAt ? new Date(value.syncedAt).toLocaleString("fr-FR") : "never"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
          <div className="neo-panel p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="neo-label mb-2">Cooldowns upstream</p>
                <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-white">Rate guard</h2>
              </div>
              <Link className="neo-button" href="/admin/actions">Open actions</Link>
            </div>
            {snapshot.upstreamCooldowns.length === 0 ? (
              <div className="border-2 border-[#22c55e] bg-[#111111] p-4 text-sm font-semibold text-[#22c55e]">
                Aucun cooldown actif.
              </div>
            ) : (
              <pre className="overflow-x-auto border-2 border-[#f59e0b] bg-[#111111] p-4 text-xs text-[#f59e0b]">
                {JSON.stringify(snapshot.upstreamCooldowns, null, 2)}
              </pre>
            )}
          </div>

          <div className="neo-panel p-6">
            <p className="neo-label mb-4">Caches annexes</p>
            <div className="grid gap-4">
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">Discover</p>
                <p className="text-lg font-black uppercase tracking-[0.08em] text-white">{snapshot.discovery.cached ? "cached" : "empty"}</p>
                <p className="mt-2 text-sm text-[#888888]">{snapshot.discovery.total.toLocaleString("fr-FR")} items</p>
              </div>
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">Favorites Kemono</p>
                <p className="text-sm text-white">{snapshot.favorites.kemono.creators} creators • {snapshot.favorites.kemono.posts} posts</p>
              </div>
              <div className="border-2 border-white bg-[#111111] p-4">
                <p className="neo-label mb-2">Favorites Coomer</p>
                <p className="text-sm text-white">{snapshot.favorites.coomer.creators} creators • {snapshot.favorites.coomer.posts} posts</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  } catch (error) {
    await logAppError("admin-dashboard", "Failed to render admin dashboard", error);
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}
