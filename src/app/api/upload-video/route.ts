import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
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
// Allow larger request bodies than the default for uploads.
export const maxDuration = 60;

/**
 * POST /api/upload-video  (multipart form-data, field "file")
 * Saves an uploaded video into /public/media, enforcing the size cap + ext.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form-data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file'." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (>${mb(MAX_UPLOAD_BYTES)}MB).` },
      { status: 413 },
    );
  }
  const name = sanitizeFilename(file.name || "upload.mp4");
  if (!hasAllowedVideoExt(name)) {
    return NextResponse.json(
      { error: "Unsupported file type (allowed: mp4, mov, webm, mkv)." },
      { status: 415 },
    );
  }

  await ensureMediaDirs();
  const dest = path.join(MEDIA_DIR, name);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buf);

  const source: LoadedSource = {
    kind: "upload",
    url: toPublicUrl(dest) ?? `/media/${name}`,
    name,
    size: file.size,
  };
  return NextResponse.json({ source });
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
