import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { PUBLIC_DIR } from "@/lib/media";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * GET /api/file/<path-under-public>
 *
 * Streams files from /public with HTTP Range support. Used instead of Next's
 * static handler because `next start` does not serve files created AFTER the
 * server booted (uploads + generated renders), which this route does.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await ctx.params;
  const rel = (parts ?? []).join("/");
  const abs = path.join(PUBLIC_DIR, rel);

  // Confine to /public.
  const within = path.relative(PUBLIC_DIR, abs);
  if (within.startsWith("..") || path.isAbsolute(within)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Never let a transient 404 (file still being produced) get cached.
  const notFound = () =>
    new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });

  let size: number;
  try {
    const s = await stat(abs);
    if (!s.isFile()) return notFound();
    size = s.size;
  } catch {
    return notFound();
  }

  const type = CONTENT_TYPES[path.extname(abs).toLowerCase()] ??
    "application/octet-stream";
  const range = _req.headers.get("range");

  // Range request (video/audio scrubbing) → 206 partial content.
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : size - 1;
      if (start <= end && end < size) {
        const stream = createReadStream(abs, { start, end });
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            "content-type": type,
            "content-length": String(end - start + 1),
            "content-range": `bytes ${start}-${end}/${size}`,
            "accept-ranges": "bytes",
            "cache-control": "no-store",
          },
        });
      }
    }
  }

  const stream = createReadStream(abs);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "content-type": type,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    },
  });
}
