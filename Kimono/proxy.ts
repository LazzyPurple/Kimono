import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getProxyDecision } from "@/lib/auth-guards";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import { getProxyTokenOptions } from "@/lib/auth-proxy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localDevMode = isLocalDevMode();

  if (localDevMode) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    ...getProxyTokenOptions({
      secret: process.env.AUTH_SECRET,
    }),
  });

  const decision = getProxyDecision({
    localDevMode,
    pathname,
    token: token
      ? {
          needsTotp: Boolean((token as { needsTotp?: boolean }).needsTotp),
        }
      : null,
  });

  if (decision.type === "redirect-login") {
    const loginUrl = new URL(decision.pathname, request.url);

    for (const [key, value] of Object.entries(decision.searchParams)) {
      loginUrl.searchParams.set(key, value);
    }

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home/:path*",
    "/discover/:path*",
    "/favorites/:path*",
    "/popular/:path*",
    "/search/:path*",
    "/creator/:path*",
    "/post/:path*",
    "/api/favorites",
    "/api/favorites/:path*",
    "/api/sessions/upstream",
    "/api/discover/:path*",
    "/api/proxy/:path*",
  ],
};
