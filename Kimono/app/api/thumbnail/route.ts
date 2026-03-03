import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { PassThrough } from "stream";

// Doit run dans l'environnement Node.js (pas Edge) pour child_process (FFMPEG)
export const dynamic = "force-dynamic";

ffmpeg.setFfmpegPath(ffmpegStatic as string);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  try {
    // Timeout global de 10s pour libérer les workers si le stream est trop lent
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 KimonoApp/1.0",
        Accept: "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.5",
      },
    });

    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: "Failed to fetch video stream" },
        { status: 400 }
      );
    }

    // Convertisseur de Web ReadableStream vers Node.js stream
    const nodeStream = new PassThrough();
    const reader = response.body.getReader();

    // Limite de taille fixée à 20MB pour éviter toute congestion de RAM
    const MAX_BYTES = 20 * 1024 * 1024;
    let byteCount = 0;

    const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              nodeStream.end();
              break;
            }
            if (value) {
              byteCount += value.length;
              if (byteCount > MAX_BYTES) {
                // Interruption agressive si limite dépassée
                nodeStream.destroy(new Error("Stream size exceeded 20MB limit"));
                await reader.cancel();
                break;
              }
              nodeStream.write(value);
            }
          }
        } catch (err) {
          nodeStream.destroy(err as NodeJS.ErrnoException);
        }
    };

    // Fire & Forget stream reader loop (FFMPEG tirera les données de l'autre bout)
    pump();

    // Promesse qui résout avec l'image passée depuis stdout de FFMPEG
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const imageStream = new PassThrough();

      imageStream.on("data", (chunk) => chunks.push(chunk));
      imageStream.on("end", () => resolve(Buffer.concat(chunks)));
      imageStream.on("error", reject);

      ffmpeg(nodeStream)
        .seekInput(2) // Saute exactement aux 2 premières secondes
        .frames(1) // Extrait l'unique frame
        .format("image2")
        .videoCodec("mjpeg")
        .on("error", (err) => {
          // Rejette s'il y a un vrai échec
          reject(err);
        })
        .pipe(imageStream, { end: true });
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable", // Cache agressif navigateur (7j)
      },
    });
  } catch (error) {
    console.error("Thumbnail generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate thumbnail or timeout exceeded" },
      { status: 400 }
    );
  }
}
