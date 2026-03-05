import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const site = searchParams.get("site");
  const service = searchParams.get("service");
  const id = searchParams.get("id");

  if (!site || !service || !id) {
    return NextResponse.json(
      { error: "Missing site, service, or id" },
      { status: 400 }
    );
  }

  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json({ error: "Invalid site" }, { status: 400 });
  }

  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const url = `${baseUrl}/api/v1/${service}/user/${id}/recommended`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        Accept: "text/css",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
        console.error(`Error fetching recommendations from ${url}: ${response.status}`);
        return NextResponse.json([]);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /api/recommended:", error);
    return NextResponse.json([]);
  }
}
