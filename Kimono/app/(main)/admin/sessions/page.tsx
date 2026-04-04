import type { Metadata } from "next";

import { AdminSessionButton } from "@/components/admin/AdminSessionButton";
import AdminErrorFallback from "@/components/admin/AdminErrorFallback";
import { StatusPill } from "@/components/main/DiagnosticsPrimitives";
import { getAdminSessionsData } from "@/lib/admin/admin-sessions";
import { logAppError } from "@/lib/app-logger";

export const metadata: Metadata = {
  title: "Admin Sessions | Kimono",
};

export default async function AdminSessionsPage() {
  try {
    const snapshot = await getAdminSessionsData();

    return (
      <>
        <div className="neo-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="neo-label mb-4">Sessions</p>
              <h1 className="neo-heading mb-3">Kemono / Coomer access</h1>
              <p className="max-w-3xl text-base leading-7 text-[#888888]">
                Sessions upstream actives et statut de securite admin.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusPill ok={snapshot.adminUserExists} label={snapshot.adminUserExists ? "admin user ready" : "admin user missing"} />
              <StatusPill ok={snapshot.totpEnabled} label={snapshot.totpEnabled ? "totp enabled" : "totp disabled"} />
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {snapshot.sessions.map((session) => (
            <div key={`${session.site}:${session.savedAt.toISOString()}`} className="neo-panel p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="neo-label">{session.site}</p>
                  <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-white">{session.username}</h2>
                  <p className="text-sm text-[#888888]">Saved at {session.savedAt.toLocaleString("fr-FR")}</p>
                </div>
                <AdminSessionButton site={session.site} />
              </div>
            </div>
          ))}

          {snapshot.sessions.length === 0 ? (
            <div className="neo-panel p-6 text-base text-[#888888]">No upstream sessions stored.</div>
          ) : null}
        </div>
      </>
    );
  } catch (error) {
    await logAppError("admin-sessions", "Failed to render admin sessions page", error);
    return <AdminErrorFallback message={error instanceof Error ? error.message : "Unknown error"} />;
  }
}
