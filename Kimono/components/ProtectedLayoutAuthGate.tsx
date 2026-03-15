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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="animate-pulse text-lg text-[#7c3aed]">Loading...</div>
      </div>
    );
  }

  if (state === "redirect") {
    redirect("/login");
  }

  return (
    <ProtectedLayoutShell showSecurityControls onLogout={() => signOut({ callbackUrl: "/" })}>
      {children}
    </ProtectedLayoutShell>
  );
}
