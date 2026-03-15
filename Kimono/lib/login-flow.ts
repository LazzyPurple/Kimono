export type LoginStep = "password" | "totp";

export const LOGIN_SESSION_TIMEOUT_MS = 3000;

export type SessionSnapshot = {
  needsTotp?: boolean;
  user?: {
    id?: string;
  } | null;
} | null;

export function getInitialLoginStep(stepParam: string | null | undefined): LoginStep {
  return stepParam === "totp" ? "totp" : "password";
}

export function getPostPasswordSuccessAction(session: SessionSnapshot):
  | { type: "show-totp"; userId: string }
  | { type: "redirect"; href: "/search" } {
  const userId = session?.user?.id?.trim();

  if (session?.needsTotp && userId) {
    return {
      type: "show-totp",
      userId,
    };
  }

  return {
    type: "redirect",
    href: "/search",
  };
}