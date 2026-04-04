import type { Metadata } from "next";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { JsonCard, StatusPill } from "@/components/main/DiagnosticsPrimitives";
import { logAppError } from "@/lib/app-logger";
import { getServerHealthPayload } from "@/lib/server-health";

export const metadata: Metadata = {
  title: "Admin Health | Kimono",
};

export default async function AdminHealthPage() {
  try {
    const payload = await getServerHealthPayload();

    return (
      <>
        <div className="neo-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="neo-label mb-4">Sante</p>
              <h1 className="neo-heading mb-3">Runtime health</h1>
              <p className="max-w-3xl text-base leading-7 text-[#888888]">
                Verifications runtime, catalogues Creator, caches favoris/discover et cooldowns upstream.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusPill ok={payload.runtime.database.driver === "postgres"} label={`database ${payload.runtime.database.driver ?? "unknown"}`} />
              <StatusPill ok={payload.runtime.previewTools.ffmpeg.status !== "missing"} label={`ffmpeg ${payload.runtime.previewTools.ffmpeg.status}`} />
              <StatusPill ok={payload.runtime.previewTools.ffprobe.status !== "missing"} label={`ffprobe ${payload.runtime.previewTools.ffprobe.status}`} />
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <JsonCard title="Runtime" value={payload.runtime} danger={payload.runtime.database.driver !== "postgres"} />
          <JsonCard title="Creator catalog" value={payload.creatorIndex} />
          <JsonCard title="Favorites" value={payload.favorites} />
          <JsonCard title="Discover cache" value={payload.discovery} />
          <JsonCard title="Cooldowns upstream" value={payload.upstreamCooldowns} danger={payload.upstreamCooldowns.length > 0} />
          <JsonCard title="Media + previews" value={{ mediaSources: payload.mediaSources, previews: payload.previews }} />
        </div>
      </>
    );
  } catch (error) {
    await logAppError("admin-health", "Failed to render admin health page", error);
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}
