import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const site = searchParams.get("site");
  const period = searchParams.get("period");
  const date = searchParams.get("date");
  const offset = searchParams.get("offset");

  if (site !== "kemono" && site !== "coomer") {
    return NextResponse.json(
      { error: "Invalid site" },
      { status: 400 }
    );
  }

  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const targetUrl = new URL(`${baseUrl}/api/v1/posts/popular`);

  // period is always sent
  if (period) {
    targetUrl.searchParams.set("period", period);
  } else {
    targetUrl.searchParams.set("period", "recent");
  }

  if (date && period !== "recent") {
    targetUrl.searchParams.set("date", date);
  }

  if (offset && Number(offset) > 0) {
    targetUrl.searchParams.set("o", offset);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "text/css",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching popular posts:", error);
    return NextResponse.json({ posts: [], info: null, props: null });
  }
}
