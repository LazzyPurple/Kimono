export interface ProxyDecisionInput {
  localDevMode: boolean;
  pathname: string;
  token: { needsTotp?: boolean } | null;
}

export type ProxyDecision =
  | { type: "allow" }
  | {
      type: "redirect-login";
      pathname: "/login";
      searchParams: Record<string, string>;
    };

export function getProxyDecision({
  localDevMode,
  pathname,
  token,
}: ProxyDecisionInput): ProxyDecision {
  if (localDevMode) {
    return { type: "allow" };
  }

  if (!token) {
    return {
      type: "redirect-login",
      pathname: "/login",
      searchParams: {
        callbackUrl: pathname,
      },
    };
  }

  if (token.needsTotp) {
    return {
      type: "redirect-login",
      pathname: "/login",
      searchParams: {
        step: "totp",
      },
    };
  }

  return { type: "allow" };
}

export function getProtectedLayoutState({
  localDevMode,
  status,
  session,
}: {
  localDevMode: boolean;
  status: "loading" | "authenticated" | "unauthenticated";
  session: unknown;
}): "loading" | "redirect" | "ready" {
  if (localDevMode) {
    return "ready";
  }

  if (status === "loading") {
    return "loading";
  }

  if (!session) {
    return "redirect";
  }

  return "ready";
}

export function getLoginRedirectTarget(localDevMode: boolean): string | null {
  return localDevMode ? "/search" : null;
}

export function shouldShowSecurityControls(localDevMode: boolean): boolean {
  return !localDevMode;
}

export function shouldEnableCredentialAuth(localDevMode: boolean): boolean {
  return !localDevMode;
}

export function getTotpSetupAvailability(
  localDevMode: boolean
): "enabled" | "disabled" {
  return localDevMode ? "disabled" : "enabled";
}
