"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/admin", label: "Dashboard", caption: "Vue generale" },
  { href: "/admin/logs", label: "Logs", caption: "Runtime et client" },
  { href: "/admin/db", label: "DB Explorer", caption: "Tables et index" },
  { href: "/admin/actions", label: "Actions", caption: "Maintenance manuelle" },
  { href: "/admin/sessions", label: "Sessions", caption: "Kemono / Coomer" },
  { href: "/admin/health", label: "Sante", caption: "Diagnostics runtime" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-4 rounded-[28px] border border-[#1e1e2e] bg-[linear-gradient(180deg,rgba(16,16,26,0.98),rgba(9,9,15,0.98))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
      <p className="text-[11px] uppercase tracking-[0.34em] text-[#8b5cf6]">Kimono Admin</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Control room</h1>
      <p className="mt-3 text-sm leading-6 text-[#9ca3af]">
        Diagnostics proteges, maintenance manuelle et vues internes du runtime.
      </p>

      <nav className="mt-6 space-y-2">
        {SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              className={`block rounded-2xl border px-4 py-3 transition ${
                active
                  ? "border-[#7c3aed] bg-[#1a1328] text-white shadow-[0_0_0_1px_rgba(124,58,237,0.2)]"
                  : "border-[#232336] bg-[#0d0d15] text-[#d1d5db] hover:border-[#312e81] hover:bg-[#141420] hover:text-white"
              }`}
            >
              <div className="text-sm font-medium">{section.label}</div>
              <div className="mt-1 text-xs text-[#8f90a6]">{section.caption}</div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 rounded-2xl border border-[#232336] bg-[#0b0b13] p-4 text-sm text-[#9ca3af]">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#c4b5fd]">Boot policy</p>
        <p className="mt-2 leading-6">
          Reset DB au demarrage desactive. Les purges passent maintenant par les actions admin.
        </p>
      </div>
    </aside>
  );
}
