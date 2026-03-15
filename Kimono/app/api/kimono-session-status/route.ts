import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await getDataStore();
    const sessions = await store.getKimonoSessions();
    const bySite = new Map(sessions.map((session) => [session.site, session]));
    const kemonoSession = bySite.get("kemono") ?? null;
    const coomerSession = bySite.get("coomer") ?? null;

    return NextResponse.json({
      kemono: {
        loggedIn: Boolean(kemonoSession),
        username: kemonoSession?.username ?? null,
      },
      coomer: {
        loggedIn: Boolean(coomerSession),
        username: coomerSession?.username ?? null,
      },
    });
  } catch (error) {
    console.error("kimono-session-status error:", error);
    return NextResponse.json(
      { error: "Impossible de recuperer le statut" },
      { status: 500 }
    );
  }
}
