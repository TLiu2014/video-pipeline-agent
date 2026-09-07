/**
 * Pure FFmpeg command-string builders, shared by the local and Replit runners.
 * No filesystem access — callers supply filenames + focal points.
 */

export const VIDEO_RE = /\.(mp4|mov|webm|mkv)$/i;
export const AUDIO_RE = /\.(wav|mp3|m4a|aac|ogg|flac)$/i;
export const SUBTITLE_RE = /\.(srt|ass|vtt)$/i;

/**
 * Deterministic multi-track subtitle burn. All tracks are bottom-anchored and
 * STACKED upward: the first track sits lowest, each subsequent track higher (a
 * larger MarginV moves it further from the bottom edge). For the bilingual case
 * that means English (track 0) on the bottom line and Chinese (track 1) just
 * above it.
 *
 * IMPORTANT: libass in `force_style` uses LEGACY SSA alignment here, NOT the ASS
 * v4+ numpad — verified empirically on ffmpeg 8/9: 2 = bottom-center (8 renders
 * in the MIDDLE). The model can't be trusted to emit the right value, so we set
 * it. The force_style value is single-quoted so its comma isn't read as a filter
 * separator, and the subtitles filters are chained with commas.
 */
export function subtitleBurnCommand(
  ffmpegBin: string,
  videoFile: string,
  srtFiles: string[],
  outFile: string,
  styleFragment: string = subtitleStyleFragment("gold", null),
  fontSize?: number,
): string {
  const BOTTOM = 2; // legacy SSA bottom-center
  const BASE_MARGIN = 36; // px from the bottom for the lowest track
  const LINE_STEP = 54; // extra px per stacked track above it
  const size = fontSize ? `,FontSize=${fontSize}` : "";
  const chain = srtFiles
    .map((srt, i) => {
      const marginV = BASE_MARGIN + i * LINE_STEP;
      return `subtitles=${srt}:force_style='Alignment=${BOTTOM},MarginV=${marginV}${size},${styleFragment}'`;
    })
    .join(",");
  return `${ffmpegBin} -nostdin -y -i ${quote(videoFile)} -vf "${chain}" ${quote(outFile)}`;
}

// ASS colours are &HAABBGGRR (alpha, blue, green, red).
const SUB_COLORS: Record<string, string> = {
  gold: "&H004BC8F2", // #F2C84B
  white: "&H00FFFFFF",
  cyan: "&H00FFFF00", // #00FFFF
};
const OUTLINE_SUFFIX =
  "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1";
/** Dark text + white outline — for bright footage (auto mode). */
const SUBTITLE_STYLE_DARK =
  "PrimaryColour=&H00000000,OutlineColour=&H00FFFFFF,BorderStyle=1,Outline=2,Shadow=1";

/**
 * force_style color fragment for the chosen subtitle style. A named color is
 * that color + black outline. "auto" probes the video's bottom-strip brightness
 * (luma 0..255; >140 ≈ light) and uses dark-on-white there, gold otherwise.
 */
export function subtitleStyleFragment(
  style: "gold" | "white" | "cyan" | "auto",
  bottomLuma: number | null,
): string {
  if (style === "auto") {
    return bottomLuma != null && bottomLuma > 140
      ? SUBTITLE_STYLE_DARK
      : `PrimaryColour=${SUB_COLORS.gold},${OUTLINE_SUFFIX}`;
  }
  return `PrimaryColour=${SUB_COLORS[style] ?? SUB_COLORS.gold},${OUTLINE_SUFFIX}`;
}

/**
 * FFmpeg command that prints the average luma (YAVG) of the video's bottom fifth
 * over the first ~30 frames — used by adaptive subtitle coloring. Parse YAVG=…
 * from its stderr and average.
 */
export function bottomLumaProbeCommand(
  ffmpegBin: string,
  videoFile: string,
): string {
  return (
    `${ffmpegBin} -nostdin -hide_banner -i ${quote(videoFile)} ` +
    `-vf "crop=iw:ih/5:0:ih*4/5,signalstats,metadata=print:key=lavfi.signalstats.YAVG" ` +
    `-frames:v 30 -f null -`
  );
}

/** Average the YAVG=… values FFmpeg's signalstats printed to stderr. */
export function parseAvgLuma(stderr: string): number | null {
  const vals = [...stderr.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

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
  // Accept both {in0}/{in1} and {in[0]}/{in[1]} — the model uses either form.
  cmd = cmd.replace(/\{in\[(\d+)\]\}/g, (_m, i) => quote(inputs[Number(i)] ?? ""));
  cmd = cmd.replace(/\{in(\d+)\}/g, (_m, i) => quote(inputs[Number(i)] ?? ""));
  cmd = cmd.replace(/\{in\}/g, quote(inputs[0] ?? ""));
  cmd = cmd.replace(/\{out\}/g, quote(outFile));
  return cmd;
}

/**
 * Content-preserving 9:16 vertical reframe: fit the WHOLE frame (no crop) over a
 * blurred, filled copy of itself, so nothing is lost — the standard Reels /
 * Shorts / TikTok look. (A hard crop would drop the sides of a landscape clip.)
 */
export function smartReframeCommand(
  ffmpegBin: string,
  videoFile: string,
  outFile: string,
): string {
  // NOTE: kept as one plain string (no template interpolation / concatenation)
  // — the SWC minifier was mis-folding the concatenated form and dropping the
  // gblur/setsar segment from the built bundle.
  const filter =
    "split[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=24,setsar=1[bg];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2";
  return `${ffmpegBin} -nostdin -y -i ${quote(videoFile)} -vf "${filter}" ${quote(outFile)}`;
}

/** Heuristic: does this ffmpeg op target a 9:16 vertical output? */
export function wantsVerticalReframe(
  command: string | undefined,
  label: string,
  outFile: string,
): boolean {
  const hay = `${command ?? ""} ${label} ${outFile}`;
  return /vertical|reels?\b|shorts?\b|tiktok|portrait|9\s*[:/]\s*16|1080\s*[:x]\s*1920|ih\s*\*\s*9\s*\/\s*16/i.test(
    hay,
  );
}

/** Which input filenames a (resolved) command actually references. */
export function referencedInputs(command: string, inputs: string[]): string[] {
  return inputs.filter((f) => f && command.includes(f));
}
