export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query, execute } from "@/lib/db";
import { generateTotpSetup } from "@/lib/auth/totp";

/**
 * GET /api/auth/totp/setup
 * Génère un nouveau secret TOTP + QR code pour l'utilisateur connecté
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const users = await query<any>("SELECT * FROM User WHERE id = ?", [session.user.id]);
  const user = users[0];

  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  if (user.totpEnabled) {
    return NextResponse.json({ error: "TOTP déjà activé" }, { status: 400 });
  }

  const { secret, qrCodeDataUrl } = await generateTotpSetup(user.email);

  // Sauvegarder le secret temporairement (pas encore activé)
  await execute("UPDATE User SET totpSecret = ? WHERE id = ?", [secret, user.id]);

  return NextResponse.json({ qrCodeDataUrl });
}

/**
 * POST /api/auth/totp/setup
 * Active le TOTP après vérification du premier code
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { code } = await request.json();

  if (!code) {
    return NextResponse.json({ error: "Code requis" }, { status: 400 });
  }

  const users = await query<any>("SELECT * FROM User WHERE id = ?", [session.user.id]);
  const user = users[0];

  if (!user || !user.totpSecret) {
    return NextResponse.json({ error: "Aucun secret TOTP trouvé" }, { status: 400 });
  }

  const { verifyTotpCode } = await import("@/lib/auth/totp");
  const isValid = verifyTotpCode(code, user.totpSecret);

  if (!isValid) {
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  }

  // Activer le TOTP
  await execute("UPDATE User SET totpEnabled = 1 WHERE id = ?", [user.id]);

  return NextResponse.json({ success: true, message: "2FA activé avec succès" });
}
