import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#05050a] px-3 py-5 text-[#f0f0f5] sm:px-5 sm:py-6 lg:px-6 lg:py-8">
      <div className="mx-auto grid max-w-[1500px] gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <AdminSidebar />
        <div className="space-y-5">
          <header className="rounded-[28px] border border-[#1e1e2e] bg-[linear-gradient(135deg,rgba(16,16,26,0.98),rgba(10,10,18,0.96))] px-5 py-4 shadow-[0_22px_60px_rgba(0,0,0,0.34)] sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.34em] text-[#8b5cf6]">Diagnostics</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Admin panel</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[#9ca3af]">
                Vue unifiee pour l’etat du runtime, la maintenance manuelle et l’exploration des caches Kimono.
              </p>
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
