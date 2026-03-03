import { NextRequest, NextResponse } from "next/server";

// Runtime Node.js pour accéder aux APIs réseau complètes
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy de thumbnail — contourne le blocage CORS côté client pour img.coomer.st / img.kemono.cr
 * Accepte ?url=<encoded-thumbnail-cdn-url>
 * Retourne l'image directement avec les bons headers CORS
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Bad protocol");
    }
    // Whitelist : uniquement les CDN connus de Kemono/Coomer
    const allowed = ["img.kemono.cr", "img.coomer.st", "img.kemono.su", "img.coomer.su"];
    if (!allowed.some((h) => parsedUrl.hostname === h)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "image/webp,image/avif,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: `https://${parsedUrl.hostname.replace("img.", "")}/`,
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `CDN returned ${response.status}` },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache 7 jours — les thumbnails CDN sont immutables
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[thumbnail-proxy] Error:", msg);
    return NextResponse.json({ error: "Proxy failed", detail: msg }, { status: 500 });
  }
}
