import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getDataStore, type SupportedSite } from "@/lib/data-store";

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
      { error: "Parametres manquants" },
      { status: 400 }
    );
  }

  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Site invalide" }, { status: 400 });
  }

  const baseUrl =
    site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  try {
    const res = await axios.post(
      `${baseUrl}/api/v1/authentication/login`,
      { username, password },
      {
        headers: {
          Accept: "text/css",
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      }
    );

    if (res.status !== 200) {
      return NextResponse.json(
        { error: res.data?.error || `Connexion echouee (${res.status})` },
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

    const sessionMatch = rawCookies.find((cookieValue) =>
      cookieValue.startsWith("session=")
    );
    const cookie = sessionMatch
      ? sessionMatch.split(";")[0]
      : rawCookies.map((cookieValue) => cookieValue.split(";")[0].trim()).join("; ");

    const store = await getDataStore();
    await store.saveKimonoSession({
      site: site as SupportedSite,
      cookie,
      username,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("kimono-login error:", error);
    return NextResponse.json(
      { error: "Connexion echouee" },
      { status: 401 }
    );
  }
}
