import { NextResponse } from "next/server";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import {
  MAX_UPLOAD_BYTES,
  MEDIA_DIR,
  ensureMediaDirs,
  hasAllowedVideoExt,
  sanitizeFilename,
  toPublicUrl,
} from "@/lib/media";
import type { LoadedSource } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/fetch-video  { url }
 * Fetches a remote video server-side (no browser download) into /public/media,
 * streaming to disk and aborting if it exceeds the size cap.
 */
export async function POST(req: Request) {
  let url = "";
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url.trim() : "";
  } catch {
    /* handled below */
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http(s) URLs are supported." },
      { status: 400 },
    );
  }

  // Derive a safe filename; default to .mp4 if the URL has no video extension.
  let name = sanitizeFilename(path.basename(parsed.pathname) || "video");
  if (!hasAllowedVideoExt(name)) name += ".mp4";

  await ensureMediaDirs();
  const dest = path.join(MEDIA_DIR, name);

  let res: Response;
  try {
    res = await fetch(parsed, {
      redirect: "follow",
      headers: {
        // Some hosts reject the default fetch UA; look like a browser.
        "user-agent":
          "Mozilla/5.0 (compatible; AgenticCinema/1.0; +video-pipeline-agent)",
        accept: "video/*,*/*",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Fetch failed: ${err instanceof Error ? err.message : "error"}` },
      { status: 502 },
    );
  }
  if (!res.ok || !res.body) {
    return NextResponse.json(
      { error: `Remote returned ${res.status}.` },
      { status: 502 },
    );
  }

  // Reject early on an over-cap Content-Length.
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (>${mb(MAX_UPLOAD_BYTES)}MB).` },
      { status: 413 },
    );
  }

  // Stream to disk, enforcing the cap as bytes arrive.
  let received = 0;
  let aborted = false;
  const out = createWriteStream(dest);
  try {
    const nodeStream = Readable.fromWeb(res.body as never);
    await new Promise<void>((resolve, reject) => {
      nodeStream.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_UPLOAD_BYTES && !aborted) {
          aborted = true;
          nodeStream.destroy();
          out.destroy();
          reject(new Error(`File too large (>${mb(MAX_UPLOAD_BYTES)}MB).`));
        }
      });
      nodeStream.pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
      nodeStream.on("error", reject);
    });
  } catch (err) {
    await unlink(dest).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed." },
      { status: aborted ? 413 : 502 },
    );
  }

  const source: LoadedSource = {
    kind: "link",
    url: toPublicUrl(dest) ?? `/media/${name}`,
    name,
    size: received,
  };
  return NextResponse.json({ source });
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
