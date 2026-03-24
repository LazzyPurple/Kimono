import { NextRequest, NextResponse } from "next/server";
import { processKimonoLogin } from "@/lib/kimono-login-route";

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

  const result = await processKimonoLogin({
    site,
    username,
    password,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
