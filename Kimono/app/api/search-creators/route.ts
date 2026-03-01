import { NextRequest, NextResponse } from "next/server";
import { searchCreators } from "@/lib/api/unified";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const creators = await searchCreators(query);
    return NextResponse.json(creators);
  } catch (err) {
    console.error("search-creators error:", err);
    return NextResponse.json(
      { error: "Impossible de rechercher les créateurs" },
      { status: 500 }
    );
  }
}
