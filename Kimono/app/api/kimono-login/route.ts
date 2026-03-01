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
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);

    const res = await axios.post(
      `${baseUrl}/api/v1/authentication/login`,
      params,
      {
        headers: {
          Accept: "text/css",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": baseUrl + "/",
        },
        maxRedirects: 5,
        validateStatus: (s: number) => s < 500,
        withCredentials: true,
      }
    );

    console.log("[LOGIN] status:", res.status);
    console.log("[LOGIN] set-cookie:", res.headers["set-cookie"]);

    const rawCookies = res.headers["set-cookie"];
    if (!rawCookies || rawCookies.length === 0) {
      console.log("[LOGIN] No cookies received - response body:", JSON.stringify(res.data));
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 }
      );
    }

    // Extraire les paires nom=valeur des cookies (sans les attributs)
    const cookie = rawCookies
      .map((c) => c.split(";")[0].trim())
      .join("; ");

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
