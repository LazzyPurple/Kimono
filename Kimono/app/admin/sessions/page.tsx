import type { Metadata } from "next";

import { AdminSessionButton } from "@/components/admin/AdminSessionButton";
import { requireAdminPageAccess } from "@/lib/admin/admin-access";
import { formatDateTime } from "@/lib/admin/admin-format";
import { getAdminSessionsData } from "@/lib/admin/admin-sessions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Sessions | Kimono",
  description: "Protected session diagnostics for Kimono.",
};

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  await requireAdminPageAccess("/admin/sessions", resolvedParams);
  const data = await getAdminSessionsData();

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">Sessions</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Sessions Kemono/Coomer</h1>
          <p className="mt-3 text-sm leading-6 text-[#9ca3af]">
            Visualise les sessions sauvegardees et deconnecte-les individuellement si une authentification distante devient douteuse.
          </p>
        </article>

        <article className="rounded-[26px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#8b5cf6]">TOTP</p>
          <p className={`mt-4 inline-flex rounded-full border px-3 py-1 text-sm ${data.totpEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
            {data.totpEnabled ? "active" : "desactive"}
          </p>
        </article>
      </section>

      <section className="space-y-4">
        {data.sessions.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#2a2a3a] bg-[#0d0d15] p-8 text-center text-[#9ca3af]">
            Aucune session Kimono sauvegardee.
          </div>
        ) : data.sessions.map((session) => (
          <article key={session.site} className="rounded-[24px] border border-[#1e1e2e] bg-[#10101a] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#17172a] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#c4b5fd]">{session.site}</span>
                  <span className="rounded-full border border-[#232336] px-3 py-1 text-xs text-[#d1d5db]">{session.username}</span>
                </div>
                <p className="text-sm text-[#9ca3af]">Sauvegardee le {formatDateTime(session.savedAt)}</p>
              </div>
              <AdminSessionButton site={session.site} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
