import { Suspense } from "react";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import { getLoginRedirectTarget } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import LoginPageClient from "@/components/LoginPageClient";

function LoginPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4">
      <div className="animate-pulse text-lg text-[#7c3aed]">Loading...</div>
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
