import { NextResponse, NextRequest } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const [kSessions, cSessions] = await Promise.all([
      query<any>("SELECT * FROM KimonoSession WHERE site = 'kemono' ORDER BY savedAt DESC LIMIT 1"),
      query<any>("SELECT * FROM KimonoSession WHERE site = 'coomer' ORDER BY savedAt DESC LIMIT 1"),
    ]);

    const kSession = kSessions[0];
    const cSession = cSessions[0];

    return NextResponse.json({
      kemono: {
        loggedIn: !!kSession,
        username: kSession?.username ?? null,
      },
      coomer: {
        loggedIn: !!cSession,
        username: cSession?.username ?? null,
      },
    });
  } catch (err) {
    console.error("kimono-session-status error:", err);
    return NextResponse.json(
      { error: "Impossible de récupérer le statut" },
      { status: 500 }
    );
  }
}
