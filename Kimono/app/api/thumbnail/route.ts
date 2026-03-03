import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { PassThrough } from "stream";

// Force le runtime Node.js (FFMPEG a besoin de child_process, incompatible avec l'Edge runtime)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Assigne le binaire statique à fluent-ffmpeg
// ffmpegStatic retourne le chemin absolu vers le .exe sur Windows
const ffmpegPath = ffmpegStatic as string;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  // Valide que c'est bien une URL HTTP(S) valide
  let url: URL;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    // Timeout global de 15s pour les serveurs lents
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; KimonoApp/1.0)",
          Accept: "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.5",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: `Failed to fetch video: HTTP ${response.status}` },
        { status: 400 }
      );
    }

    // Limite la quantité de données lues à 20MB pour éviter de saturer la RAM
    const MAX_BYTES = 20 * 1024 * 1024;
    let byteCount = 0;

    // Convertit le Web ReadableStream en Node.js PassThrough stream (requis par fluent-ffmpeg)
    const nodeStream = new PassThrough();
    const reader = response.body.getReader();

    // Pompe les chunks en arrière-plan — FFMPEG consomme de l'autre côté
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            nodeStream.end();
            break;
          }
          if (value) {
            byteCount += value.byteLength;
            if (byteCount > MAX_BYTES) {
              // Stop le download si on dépasse la limite
              nodeStream.end();
              await reader.cancel("size limit exceeded");
              break;
            }
            nodeStream.write(Buffer.from(value));
          }
        }
      } catch (err) {
        nodeStream.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    // Extrait 1 frame à t=2s (2s évite le fade-in noir des vidéos) et la renvoie en JPEG
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const imageStream = new PassThrough();

      imageStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      imageStream.on("end", () => resolve(Buffer.concat(chunks)));
      imageStream.on("error", reject);

      ffmpeg(nodeStream)
        .inputOption("-ss 2")   // seek à 2s en input (plus rapide que seekInput post-decode)
        .frames(1)
        .format("image2")
        .videoCodec("mjpeg")
        .outputOptions(["-q:v 5"]) // qualité JPEG 1-31, 5 = bon compromis
        .on("error", (err: Error) => reject(err))
        .pipe(imageStream, { end: true });
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // Cache 7 jours côté navigateur + CDN — les thumbnails ne changent pas
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error) {
    console.error("[thumbnail] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Failed to generate thumbnail" },
      { status: 500 }
    );
  }
}
