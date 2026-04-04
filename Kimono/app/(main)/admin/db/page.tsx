import type { Metadata } from "next";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { getAdminDbSnapshot } from "@/lib/admin/admin-db";
import { logAppError } from "@/lib/app-logger";

export const metadata: Metadata = {
  title: "Admin DB | Kimono",
};

type SearchParams = {
  q?: string | string[];
  page?: string | string[];
  perPage?: string | string[];
  sort?: string | string[];
  order?: string | string[];
  site?: string | string[];
  service?: string | string[];
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

export default async function AdminDbPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  try {
    const resolvedSearchParams = await searchParams;
    const snapshot = await getAdminDbSnapshot({
      q: getSingleValue(resolvedSearchParams.q) ?? "",
      page: Number(getSingleValue(resolvedSearchParams.page) ?? "1"),
      perPage: Number(getSingleValue(resolvedSearchParams.perPage) ?? "50"),
      sort: getSingleValue(resolvedSearchParams.sort),
      order: getSingleValue(resolvedSearchParams.order),
      site: getSingleValue(resolvedSearchParams.site),
      service: getSingleValue(resolvedSearchParams.service),
    });

    return (
      <>
        <div className="neo-panel p-6 sm:p-8">
          <p className="neo-label mb-4">DB Explorer</p>
          <h1 className="neo-heading mb-3">Live table counts</h1>
          <p className="max-w-3xl text-base leading-7 text-[#888888]">
            Vue temps reel des tables PostgreSQL Kimono, plus une recherche paginee dans le catalogue Creator.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.tables.map((table) => (
            <div key={table.key} className="neo-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="neo-label mb-2">{table.key}</p>
                  <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-white">{table.rows.toLocaleString("fr-FR")}</h2>
                </div>
                <span className="border-2 border-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#888888]">
                  {formatBytes(table.sizeBytes)}
                </span>
              </div>
              <pre className="mt-4 overflow-x-auto border-2 border-white bg-[#111111] p-4 text-xs text-[#f5f5f5]">
                {JSON.stringify(table.sampleRows, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        <div className="neo-panel p-6 sm:p-8">
          <div className="flex flex-col gap-3 border-b-2 border-white pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="neo-label mb-2">Creator search</p>
              <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-white">Paginated catalog explorer</h2>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-[#888888]">
              <span className="border-2 border-white px-3 py-2">q: {snapshot.creatorSearch.q || "none"}</span>
              <span className="border-2 border-white px-3 py-2">sort: {snapshot.creatorSearch.sort}</span>
              <span className="border-2 border-white px-3 py-2">order: {snapshot.creatorSearch.order}</span>
              <span className="border-2 border-white px-3 py-2">fresh: {snapshot.creatorSearch.snapshotFresh ? "yes" : "no"}</span>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto border-2 border-white bg-[#111111]">
            <table className="min-w-full border-collapse text-left text-sm text-[#f5f5f5]">
              <thead className="border-b-2 border-white bg-[#1a1a1a] text-xs uppercase tracking-[0.2em] text-[#888888]">
                <tr>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-4 py-3">Posts</th>
                  <th className="px-4 py-3">Favorited</th>
                  <th className="px-4 py-3">Synced</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.creatorSearch.rows.map((creator) => (
                  <tr key={`${creator.site}:${creator.service}:${creator.creatorId}`} className="border-b border-white/10">
                    <td className="px-4 py-3 uppercase">{creator.site}</td>
                    <td className="px-4 py-3 uppercase">{creator.service}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{creator.name}</div>
                      <div className="text-xs text-[#888888]">{creator.creatorId}</div>
                    </td>
                    <td className="px-4 py-3">{creator.postCount.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3">{creator.favorited.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-xs text-[#888888]">
                      {creator.catalogSyncedAt ? new Date(creator.catalogSyncedAt).toLocaleString("fr-FR") : "never"}
                    </td>
                  </tr>
                ))}
                {snapshot.creatorSearch.rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-[#888888]" colSpan={6}>No creator rows for this filter.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  } catch (error) {
    await logAppError("admin-db", "Failed to render admin DB explorer", error);
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}
