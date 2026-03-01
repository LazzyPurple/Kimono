import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [kSession, cSession] = await Promise.all([
      prisma.kimonoSession.findFirst({ where: { site: "kemono" }, orderBy: { savedAt: "desc" } }),
      prisma.kimonoSession.findFirst({ where: { site: "coomer" }, orderBy: { savedAt: "desc" } }),
    ]);

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
