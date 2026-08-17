import path from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Server-side media workspace layout. Everything lives under /public so the
 * browser can preview it directly.
 *
 *   public/samples   bundled demo clips (committed)          → /samples/*
 *   public/media     staged sources from load tiers          → /media/*
 *   public/renders   per-run working dir + generated outputs → /renders/*
 */
export const PUBLIC_DIR = path.resolve("public");
export const SAMPLES_DIR = path.join(PUBLIC_DIR, "samples");
export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || "public/media");
export const RENDERS_DIR = path.resolve(
  process.env.RENDERS_DIR || "public/renders",
);

/** Hard cap for fetched / uploaded videos (bytes). */
export const MAX_UPLOAD_BYTES =
  Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024;

export const ALLOWED_VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];

/** Ensure the writable media dirs exist. */
export async function ensureMediaDirs(): Promise<void> {
  await Promise.all([
    mkdir(MEDIA_DIR, { recursive: true }),
    mkdir(RENDERS_DIR, { recursive: true }),
  ]);
}

/** Strip path separators / traversal from a user-supplied filename. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.replace(/^\.+/, "") || "video";
}

/**
 * Map an absolute path inside /public to its served URL. We serve through the
 * /api/file route (not Next's static handler) because `next start` won't serve
 * files created after boot — i.e. uploads and generated renders.
 */
export function toPublicUrl(absPath: string): string | null {
  const rel = path.relative(PUBLIC_DIR, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return "/api/file/" + rel.split(path.sep).join("/");
}

/**
 * Resolve a served URL back to an absolute path, confined to /public. Accepts
 * both "/api/file/renders/x" and a bare "/renders/x". Returns null on traversal.
 */
export function fromPublicUrl(url: string): string | null {
  if (!url.startsWith("/")) return null;
  const stripped = url.replace(/^\/api\/file\//, "").replace(/^\/+/, "");
  const abs = path.join(PUBLIC_DIR, stripped);
  const rel = path.relative(PUBLIC_DIR, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

export function hasAllowedVideoExt(name: string): boolean {
  return ALLOWED_VIDEO_EXT.includes(path.extname(name).toLowerCase());
}
