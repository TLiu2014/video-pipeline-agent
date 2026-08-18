/**
 * Pure FFmpeg command-string builders, shared by the local and Replit runners.
 * No filesystem access — callers supply filenames + focal points.
 */

export const VIDEO_RE = /\.(mp4|mov|webm|mkv)$/i;

/** Minimal shell-safe single-quoting for POSIX shells. */
export function quote(s: string): string {
  if (s === "") return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Substitute {in}, {in0..n} and {out} placeholders in a command template and
 * inject `-nostdin -y` (never block on a prompt, always overwrite on re-runs).
 */
export function applyTemplate(
  ffmpegBin: string,
  command: string,
  inputs: string[],
  outFile: string,
): string {
  let cmd = command.trim();
  if (cmd.startsWith("ffmpeg")) {
    cmd = `${ffmpegBin} -nostdin -y${cmd.slice("ffmpeg".length)}`;
  }
  cmd = cmd.replace(/\{in(\d+)\}/g, (_m, i) => quote(inputs[Number(i)] ?? ""));
  cmd = cmd.replace(/\{in\}/g, quote(inputs[0] ?? ""));
  cmd = cmd.replace(/\{out\}/g, quote(outFile));
  return cmd;
}

/**
 * Build a subject-centered 9:16 crop command from a focal point (0..1). The
 * single-quoted x-expression protects its commas from the filtergraph parser.
 */
export function smartReframeCommand(
  ffmpegBin: string,
  videoFile: string,
  outFile: string,
  focalX: number,
): string {
  const fx = Math.min(1, Math.max(0, focalX));
  const filter =
    `crop=ih*9/16:ih:x='min(max(${fx}*iw-ih*9/16/2,0),iw-ih*9/16)':y=0,` +
    `scale=1080:1920`;
  return `${ffmpegBin} -nostdin -y -i ${quote(videoFile)} -vf "${filter}" ${quote(outFile)}`;
}

/** Parse a crop plan's focalX (0..1) from its JSON text, or null. */
export function parseFocalX(planJson: string): number | null {
  try {
    const fx = Number(JSON.parse(planJson)?.focalX);
    return Number.isFinite(fx) ? Math.min(1, Math.max(0, fx)) : null;
  } catch {
    return null;
  }
}

/** Which input filenames a (resolved) command actually references. */
export function referencedInputs(command: string, inputs: string[]): string[] {
  return inputs.filter((f) => f && command.includes(f));
}
