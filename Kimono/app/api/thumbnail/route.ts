import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

// Runtime Node.js pour accéder aux APIs réseau complètes
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy de thumbnail — contourne le blocage CORS côté client
 * Accepte ?url=<encoded-url>
 * Whitelist SSRF : seuls les domaines CDN et data connus sont autorisés.
 */

const ALLOWED_HOSTS = [
  // CDN thumbnails
  "img.kemono.cr",
  "img.coomer.st",
  "img.kemono.su",
  "img.coomer.su",
  // Data domains (images/vidéos originales)
  "kemono.cr",
  "coomer.st",
  "kemono.su",
  "coomer.su",
];

function autoReferer(hostname: string): string {
  // img.kemono.cr → kemono.cr, coomer.st → coomer.st
  const base = hostname.replace(/^img\./, "");
  return `https://${base}/`;
}

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
    if (!ALLOWED_HOSTS.some((h) => parsedUrl.hostname === h)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const response = await axios.get(parsedUrl.toString(), {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/webp,image/avif,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: autoReferer(parsedUrl.hostname),
      },
      validateStatus: (s) => s < 500,
    });

    if (response.status === 404) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 }
      );
    }
    if (response.status >= 400) {
      return NextResponse.json(
        { error: `CDN returned ${response.status}` },
        { status: 502 }
      );
    }

    const contentType =
      response.headers["content-type"] ?? "image/jpeg";

    return new NextResponse(response.data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[thumbnail-proxy] Error:", msg);
    return NextResponse.json(
      { error: "Proxy failed", detail: msg },
      { status: 500 }
    );
  }
}
