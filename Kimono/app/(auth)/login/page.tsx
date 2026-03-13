import { Suspense } from "react";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import { getLoginRedirectTarget } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import LoginPageClient from "@/components/LoginPageClient";

function LoginPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <div className="text-[#7c3aed] text-lg animate-pulse">Chargement...</div>
    </div>
  );
}

export default function LoginPage() {
  const redirectTarget = getLoginRedirectTarget(isLocalDevMode());

  if (redirectTarget) {
    redirect(redirectTarget);
  }

  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}