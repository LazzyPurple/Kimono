import { isLocalDevMode } from "@/lib/local-dev-mode";
import { getLoginRedirectTarget } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import LoginPageClient from "@/components/LoginPageClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const redirectTarget = getLoginRedirectTarget(isLocalDevMode());

  if (redirectTarget) {
    redirect(redirectTarget);
  }

  const resolvedSearchParams = await searchParams;
  return <LoginPageClient initialStepParam={resolvedSearchParams?.step} />;
}
