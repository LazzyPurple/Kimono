import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import axios from "axios";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const site = searchParams.get("site");
  const service = searchParams.get("service") ?? "";
  const user = searchParams.get("user") ?? "";
  const id = searchParams.get("id") ?? "";

  if (!site || (site !== "kemono" && site !== "coomer") || !service || !user || !id) {
    return NextResponse.json({ error: "ParamÃ¨tres manquants ou invalides" }, { status: 400 });
  }

  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  try {
    const sessions = await query<any>(
      "SELECT * FROM KimonoSession WHERE site = ? ORDER BY savedAt DESC LIMIT 1",
      [site]
    );
    const session = sessions[0];

    const { data } = await axios.get(
      `${baseUrl}/api/v1/${service}/user/${user}/post/${id}`,
      {
        headers: {
          Accept: "text/css",
          ...(session?.cookie ? { Cookie: session.cookie } : {}),
        },
        timeout: 15000,
      }
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("post route error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

