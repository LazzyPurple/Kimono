"use client";

import { redirect } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import ProtectedLayoutShell from "@/components/ProtectedLayoutShell";
import { getProtectedLayoutState } from "@/lib/auth-guards";

export default function ProtectedLayoutAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const state = getProtectedLayoutState({
    localDevMode: false,
    status,
    session,
  });

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-pulse text-[#7c3aed] text-lg">Chargement...</div>
      </div>
    );
  }

  if (state === "redirect") {
    redirect("/login");
  }

  return (
    <ProtectedLayoutShell
      showSecurityControls
      onLogout={() => signOut({ callbackUrl: "/" })}
    >
      {children}
    </ProtectedLayoutShell>
  );
}
