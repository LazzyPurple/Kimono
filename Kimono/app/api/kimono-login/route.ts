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
    const res = await axios.post(
      `${baseUrl}/api/v1/authentication/login`,
      { username, password },
      {
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
        withCredentials: true,
      }
    );

    const rawCookies = res.headers["set-cookie"];
    if (!rawCookies || rawCookies.length === 0) {
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 }
      );
    }

    // Extraire les paires nom=valeur des cookies (sans les attributs)
    const cookie = rawCookies
      .map((c) => c.split(";")[0].trim())
      .join("; ");

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
