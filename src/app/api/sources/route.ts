import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  MEDIA_DIR,
  SAMPLES_DIR,
  hasAllowedVideoExt,
  toPublicUrl,
} from "@/lib/media";

export const runtime = "nodejs";

interface FileEntry {
  name: string;
  url: string;
  size: number;
}

async function listVideos(dir: string, urlBase: string): Promise<FileEntry[]> {
  try {
    const files = await readdir(dir);
    const entries = await Promise.all(
      files
        .filter((f) => hasAllowedVideoExt(f))
        .map(async (f) => {
          const abs = path.join(dir, f);
          const url = toPublicUrl(abs) ?? `${urlBase}/${f}`;
          return { name: f, url, size: (await stat(abs)).size };
        }),
    );
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Prettify a filename into a picker label: "my-clip_v2.mp4" → "My Clip V2". */
function prettyLabel(file: string): string {
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * GET /api/sources
 * Lists whatever clips are present in /public/samples (drop any speech clip in
 * there and it shows up) plus previously staged sources in /public/media.
 */
export async function GET() {
  const [sampleFiles, media] = await Promise.all([
    listVideos(SAMPLES_DIR, "/samples"),
    listVideos(MEDIA_DIR, "/media"),
  ]);

  const samples = sampleFiles.map((f) => ({
    id: f.name,
    label: prettyLabel(f.name),
    note: `${(f.size / (1024 * 1024)).toFixed(1)}MB`,
    url: f.url,
    available: true,
  }));

  return NextResponse.json({ samples, media });
}
