import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { site, username, password } = body as {
    site: string;
    username: string;
    password: string;
  };

  if (!site || !username || !password) {
    return NextResponse.json(
      { error: "Paramètres manquants" },
      { status: 400 }
    );
  }

  const baseUrl =
    site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  try {
    // JSON body (comme KemonoSnap), pas URLSearchParams
    const res = await axios.post(
      `${baseUrl}/api/v1/authentication/login`,
      { username, password },
      {
        headers: {
          Accept: "text/css",
          "Content-Type": "application/json",
        },
        // Gérer tous les status manuellement (ne pas throw sur 401, etc.)
        validateStatus: () => true,
      }
    );

    console.log("[LOGIN] status:", res.status);
    console.log("[LOGIN] set-cookie:", res.headers["set-cookie"]);

    // Vérifier explicitement le status avant de chercher les cookies
    if (res.status !== 200) {
      console.log("[LOGIN] Non-200 response:", res.status, "body:", JSON.stringify(res.data));
      return NextResponse.json(
        { error: res.data?.error || `Connexion échouée (${res.status})` },
        { status: 401 }
      );
    }

    const rawCookies = res.headers["set-cookie"];
    if (!rawCookies || rawCookies.length === 0) {
      console.log("[LOGIN] No cookies received - response body:", JSON.stringify(res.data));
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 }
      );
    }

    // Extraire spécifiquement le cookie session= (comme KemonoSnap)
    const sessionMatch = rawCookies.find((c) => c.startsWith("session="));
    const cookie = sessionMatch
      ? sessionMatch.split(";")[0]
      : rawCookies.map((c) => c.split(";")[0].trim()).join("; ");

    console.log("[LOGIN] Cookie extracted:", cookie);

    // Supprimer l'ancienne session et créer la nouvelle
    await prisma.kimonoSession.deleteMany({ where: { site } });
    await prisma.kimonoSession.create({
      data: { site, cookie, username },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("kimono-login error:", err);
    return NextResponse.json(
      { error: "Connexion échouée" },
      { status: 401 }
    );
  }
}