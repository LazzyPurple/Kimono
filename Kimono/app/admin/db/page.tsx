import type { Metadata } from "next";
import Link from "next/link";

import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { firstSearchParam, requireAdminPageAccess } from "@/lib/admin/admin-access";
import { getAdminDbOverview, getAdminTablePayload, type AdminDbTableKey } from "@/lib/admin/admin-db";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/admin/admin-format";
import { logAppError } from "@/lib/app-logger";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin DB Explorer | Kimono",
  description: "Protected database explorer for Kimono caches and sessions.",
};

function clampPage(value: string | null): number {
  return Math.max(1, Number(value ?? "1") || 1);
}

export default async function AdminDbPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  await requireAdminPageAccess("/admin/db", resolvedParams);

  try {
    const requestedTable = firstSearchParam(resolvedParams.table) as AdminDbTableKey | null;
    const allowedTables: AdminDbTableKey[] = ["Creator", "Post", "MediaAsset", "MediaSource", "FavoriteChronology", "FavoriteCache", "KimonoSession", "DiscoveryCache", "DiscoveryBlock"];
    const selectedTable = requestedTable && allowedTables.includes(requestedTable) ? requestedTable : "Creator";
    const q = firstSearchParam(resolvedParams.q) ?? "";
    const sort = (firstSearchParam(resolvedParams.sort) as "favorited" | "updated" | "name" | null) ?? "favorited";
    const page = clampPage(firstSearchParam(resolvedParams.page));

    const [overview, tablePayload] = await Promise.all([
      getAdminDbOverview(),
      getAdminTablePayload({
        table: selectedTable,
        q,
        sort,
        page,
        perPage: selectedTable === "Creator" ? 25 : 8,
      }),
    ]);

    return (
      <div className="space-y-5">
        <section className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">DB Explorer</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Tables et caches internes</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9ca3af]">
            Vue technique sur les tables clefs de Kimono. Creator dispose d&apos;un mode pagine avec search et tri.
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {overview.map((table) => (
            <article key={table.table} className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{table.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#9ca3af]">{table.description}</p>
                </div>
                <Link
                  href={`/admin/db?table=${encodeURIComponent(table.table)}`}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#312e81] px-4 text-sm font-medium text-[#d9ccff] transition hover:border-[#4c1d95] hover:bg-[#17172a] hover:text-white"
                >
                  Ouvrir
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#d1d5db]">
                <span className="rounded-full bg-[#17172a] px-3 py-1">{formatNumber(table.count)} lignes</span>
                <span className="rounded-full bg-[#17172a] px-3 py-1">{table.sizeEstimateBytes == null ? "taille n/a" : formatBytes(table.sizeEstimateBytes)}</span>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-[#232336]">
                <table className="min-w-full text-left text-sm">
                  <tbody>
                    {table.recentRows.map((row, index) => (
                      <tr key={`${table.table}-${index}`} className="border-t border-[#1e1e2e] first:border-t-0">
                        <td className="px-4 py-3 text-[#9ca3af]">{JSON.stringify(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Vue detaillee</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{selectedTable}</h2>
            </div>

            {selectedTable === "Creator" ? (
              <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_120px_auto]">
                <input type="hidden" name="table" value="Creator" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search creators"
                  className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-4 text-sm text-white placeholder:text-[#6b7280]"
                />
                <select
                  name="sort"
                  defaultValue={sort}
                  className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-3 text-sm text-white"
                >
                  <option value="favorited">favorited</option>
                  <option value="updated">updated</option>
                  <option value="name">name</option>
                </select>
                <input type="number" name="page" min={1} defaultValue={String(page)} className="h-11 rounded-xl border border-[#232336] bg-[#0b0b13] px-4 text-sm text-white" />
                <button type="submit" className="h-11 rounded-xl bg-[#7c3aed] px-5 text-sm font-medium text-white transition hover:bg-[#6d28d9]">
                  Refresh
                </button>
              </form>
            ) : null}
          </div>

          {tablePayload.mode === "creator-index" ? (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-[#d1d5db]">
                <span className="rounded-full bg-[#17172a] px-3 py-1">{formatNumber(tablePayload.data.total)} createurs</span>
                <span className="rounded-full bg-[#17172a] px-3 py-1">catalog {tablePayload.data.snapshotFresh ? "fresh" : "stale"}</span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#232336]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#0b0b13] text-[#9ca3af]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Site</th>
                      <th className="px-4 py-3 font-medium">Service</th>
                      <th className="px-4 py-3 font-medium">Favorited</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablePayload.data.rows.map((item) => (
                      <tr key={`${item.site}-${item.service}-${item.creatorId}`} className="border-t border-[#1e1e2e]">
                        <td className="px-4 py-3 text-white">{item.name}</td>
                        <td className="px-4 py-3 text-[#d1d5db]">{item.site}</td>
                        <td className="px-4 py-3 text-[#d1d5db]">{item.service}</td>
                        <td className="px-4 py-3 text-[#d1d5db]">{formatNumber(item.favorited ?? 0)}</td>
                        <td className="px-4 py-3 text-[#9ca3af]">{formatDateTime(item.updated == null ? null : new Date(item.updated * 1000))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs text-[#d1d5db]">
                <span className="rounded-full bg-[#17172a] px-3 py-1">{formatNumber(tablePayload.data.count)} lignes</span>
                <span className="rounded-full bg-[#17172a] px-3 py-1">{tablePayload.data.sizeEstimateBytes == null ? "taille n/a" : formatBytes(tablePayload.data.sizeEstimateBytes)}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[#232336]">
                <table className="min-w-full text-left text-sm">
                  <tbody>
                    {tablePayload.data.recentRows.map((row, index) => (
                      <tr key={`${selectedTable}-detail-${index}`} className="border-t border-[#1e1e2e] first:border-t-0">
                        <td className="px-4 py-3 text-[#d1d5db]">{JSON.stringify(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  } catch (error) {
    await logAppError("admin", "Admin DB page render failed", error, {
      details: { page: "/admin/db" },
    });
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}


