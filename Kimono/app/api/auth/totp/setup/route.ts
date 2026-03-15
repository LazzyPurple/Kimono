export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateTotpSetup } from "@/lib/auth/totp";
import { getDataStore } from "@/lib/data-store";
import { getTotpSetupAvailability } from "@/lib/auth-guards";
import { isLocalDevMode } from "@/lib/local-dev-mode";

function getDisabledTotpResponse() {
  return NextResponse.json({ error: "Introuvable" }, { status: 404 });
}

export async function GET() {
  if (getTotpSetupAvailability(isLocalDevMode()) === "disabled") {
    return getDisabledTotpResponse();
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const store = await getDataStore();
  const user = await store.getUserById(session.user.id);

  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  if (user.totpEnabled) {
    return NextResponse.json({ error: "TOTP deja active" }, { status: 400 });
  }

  const { secret, qrCodeDataUrl } = await generateTotpSetup(user.email);
  await store.updateUserTotpSecret(user.id, secret);

  return NextResponse.json({ qrCodeDataUrl });
}

export async function POST(request: Request) {
  if (getTotpSetupAvailability(isLocalDevMode()) === "disabled") {
    return getDisabledTotpResponse();
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const { code } = await request.json();

  if (!code) {
    return NextResponse.json({ error: "Code requis" }, { status: 400 });
  }

  const store = await getDataStore();
  const user = await store.getUserById(session.user.id);

  if (!user || !user.totpSecret) {
    return NextResponse.json({ error: "Aucun secret TOTP trouve" }, { status: 400 });
  }

  const { verifyTotpCode } = await import("@/lib/auth/totp");
  const isValid = verifyTotpCode(code, user.totpSecret);

  if (!isValid) {
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  }

  await store.enableUserTotp(user.id);

  return NextResponse.json({ success: true, message: "2FA activee avec succes" });
}
