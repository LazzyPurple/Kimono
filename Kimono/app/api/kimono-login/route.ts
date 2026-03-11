import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { execute } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Site invalide" }, { status: 400 });
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

    // Vérifier explicitement le status avant de chercher les cookies
    if (res.status !== 200) {
      return NextResponse.json(
        { error: res.data?.error || `Connexion échouée (${res.status})` },
        { status: 401 }
      );
    }

    const rawCookies = res.headers["set-cookie"];
    if (!rawCookies || rawCookies.length === 0) {
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

    // Supprimer l'ancienne session et créer la nouvelle
    await execute("DELETE FROM KimonoSession WHERE site = ?", [site]);
    await execute("INSERT INTO KimonoSession (id, site, cookie, username) VALUES (?, ?, ?, ?)", [crypto.randomUUID(), site, cookie, username]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("kimono-login error:", err);
    return NextResponse.json(
      { error: "Connexion échouée" },
      { status: 401 }
    );
  }
}
