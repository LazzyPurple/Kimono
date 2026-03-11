import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Protects private routes without importing auth.ts in the Edge runtime.
 */
export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token.needsTotp) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("step", "totp");
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
    "/api/post",
    "/api/popular-posts",
    "/api/recommended",
    "/api/search-creators",
    "/api/recent-posts",
    "/api/creator-posts",
    "/api/creator-profile",
    "/api/kimono-favorites",
    "/api/kimono-login",
    "/api/kimono-session-status",
    "/api/likes/:path*",
    "/api/discover/:path*",
    "/api/proxy/:path*",
  ],
};