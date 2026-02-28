import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware de protection des routes.
 * Ne charge PAS auth.ts pour éviter les imports Node.js en Edge.
 * Vérifie simplement l'existence d'un token JWT valide.
 */
export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  // Si pas de token, rediriger vers la page de login
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si le token indique que le TOTP est requis mais pas encore vérifié,
  // bloquer l'accès aux routes protégées
  if (token.needsTotp) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("step", "totp");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/favorites/:path*",
    "/search/:path*",
    "/creator/:path*",
  ],
};
