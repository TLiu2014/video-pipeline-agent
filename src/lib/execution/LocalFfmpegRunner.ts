import { exec } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RENDERS_DIR, ensureMediaDirs, toPublicUrl } from "@/lib/media";
import {
  langFromFilename,
  languageName,
  toSrt,
  transcribeAudio,
} from "@/lib/agent/transcribe";
import { analyzeReframe } from "@/lib/agent/reframe";

const VIDEO_RE = /\.(mp4|mov|webm|mkv)$/i;
import type {
  ExecutorService,
  OperationResult,
  OperationSpec,
  ProducedArtifact,
} from "./types";

const execAsync = promisify(exec);

/**
 * Runs operations on the local machine inside the renders working directory.
 *
 * - "ffmpeg" ops are executed for real via child_process.
 * - "gemini" ops that produce subtitles run real Gemini transcription +
 *   translation (needs GOOGLE_API_KEY); other gemini ops are stubbed.
 * - "tts" ops are stubbed (wire a TTS service here for AI dubbing).
 */
export class LocalFfmpegRunner implements ExecutorService {
  readonly mode = "local" as const;
  private readonly dir = RENDERS_DIR;
  private readonly ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";

  private urlFor(filename: string): string {
    return toPublicUrl(path.join(this.dir, filename)) ?? `/renders/${filename}`;
  }

  async runOperation(spec: OperationSpec): Promise<OperationResult> {
    await ensureMediaDirs();
    if (spec.engine === "ffmpeg") return this.runFfmpeg(spec);
    if (spec.engine === "gemini") return this.runGemini(spec);
    // tts (and anything else): stubbed for now.
    return {
      id: spec.id,
      ok: true,
      skipped: true,
      logs: `[local] "${spec.label}" uses the "${spec.engine}" engine — stubbed (wire a real ${spec.engine} service here).`,
      produced: [],
    };
  }

  /** Real FFmpeg execution for deterministic media transforms. */
  private async runFfmpeg(spec: OperationSpec): Promise<OperationResult> {
    const out = spec.outputs[0];
    if (!out) {
      return {
        id: spec.id,
        ok: false,
        error: "ffmpeg operation has no output",
        logs: "",
        produced: [],
      };
    }

    // Smart reframe: if this op consumes a crop plan (produced by the Gemini
    // Speaker Tracker), crop a 9:16 window centered on the subject. Without a
    // plan (Gemini skipped), fall back to the op's own command (dumb center
    // crop) — so the flow still runs, just less intelligently.
    let command = await this.smartReframeCommand(spec, out.filename);
    if (!command) {
      if (!spec.command) {
        return {
          id: spec.id,
          ok: false,
          error: "ffmpeg operation missing command",
          logs: "",
          produced: [],
        };
      }
      command = this.buildCommand(spec, out.filename);
    }

    // Don't run the op if the input files its command actually references were
    // never produced (e.g. the Subtitle Burner when transcription was skipped).
    // Inputs not referenced by the command (like the optional crop plan) don't
    // gate execution — so the reframe still runs its center-crop fallback.
    const missing: string[] = [];
    for (const f of spec.inputs) {
      if (command.includes(f) && !(await exists(path.join(this.dir, f)))) {
        missing.push(f);
      }
    }
    if (missing.length) {
      return {
        id: spec.id,
        ok: true,
        skipped: true,
        error: `needs ${missing.join(", ")}`,
        logs: `[local] "${spec.label}" not run — missing input(s): ${missing.join(
          ", ",
        )}. Produce them first (this step depends on an earlier stage that didn't complete).`,
        produced: [],
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.dir,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      });
      return {
        id: spec.id,
        ok: true,
        logs: `$ ${command}\n${stderr || stdout}`.trim(),
        produced: [
          { id: out.id, filename: out.filename, url: this.urlFor(out.filename) },
        ],
      };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return {
        id: spec.id,
        ok: false,
        error: e.message ?? "ffmpeg failed",
        logs: `$ ${command}\n${e.stderr ?? ""}`.trim(),
        produced: [],
      };
    }
  }

  /** Route a gemini op to transcription (subtitle outputs) or reframe analysis
   *  (a text/plan output). */
  private async runGemini(spec: OperationSpec): Promise<OperationResult> {
    const subs = spec.outputs.filter((o) => o.media === "subtitle");
    if (subs.length > 0) return this.runTranscribe(spec, subs);

    const plan = spec.outputs.find((o) => o.media === "text");
    if (plan) return this.runReframeAnalysis(spec, plan);

    return {
      id: spec.id,
      ok: true,
      skipped: true,
      logs: `[local] "${spec.label}" (gemini) has no subtitle or plan output — stubbed.`,
      produced: [],
    };
  }

  /** Gemini transcription + translation for subtitle outputs. */
  private async runTranscribe(
    spec: OperationSpec,
    subs: OperationSpec["outputs"],
  ): Promise<OperationResult> {
    const audio = spec.inputs[0];
    if (!audio) {
      return {
        id: spec.id,
        ok: false,
        error: "no audio input for transcription",
        logs: "",
        produced: [],
      };
    }

    const langs = subs.map((o) => langFromFilename(o.filename));
    try {
      const segments = await transcribeAudio(path.join(this.dir, audio), langs);
      const produced: ProducedArtifact[] = [];
      for (const o of subs) {
        const lang = langFromFilename(o.filename);
        const srt = toSrt(segments, lang);
        await writeFile(path.join(this.dir, o.filename), srt, "utf8");
        produced.push({
          id: o.id,
          filename: o.filename,
          url: this.urlFor(o.filename),
        });
      }
      return {
        id: spec.id,
        ok: true,
        logs: `[gemini] transcribed ${audio} → ${segments.length} segments → ${langs
          .map(languageName)
          .join(", ")}`,
        produced,
      };
    } catch (err) {
      return {
        id: spec.id,
        ok: false,
        skipped: !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY,
        error: err instanceof Error ? err.message : "transcription failed",
        logs: `[gemini] ${err instanceof Error ? err.message : "failed"} — set GOOGLE_API_KEY to enable real transcription.`,
        produced: [],
      };
    }
  }

  /** Gemini reframe analysis → writes a crop plan for the ffmpeg reframe step. */
  private async runReframeAnalysis(
    spec: OperationSpec,
    planOut: OperationSpec["outputs"][number],
  ): Promise<OperationResult> {
    const video = spec.inputs.find((f) => VIDEO_RE.test(f)) ?? spec.inputs[0];
    if (!video) {
      return {
        id: spec.id,
        ok: false,
        error: "no video input for reframe analysis",
        logs: "",
        produced: [],
      };
    }
    try {
      const plan = await analyzeReframe(path.join(this.dir, video));
      await writeFile(
        path.join(this.dir, planOut.filename),
        JSON.stringify(plan, null, 2),
        "utf8",
      );
      return {
        id: spec.id,
        ok: true,
        logs: `[gemini] subject focalX=${plan.focalX.toFixed(2)}${
          plan.reason ? ` — ${plan.reason}` : ""
        }`,
        produced: [
          {
            id: planOut.id,
            filename: planOut.filename,
            url: this.urlFor(planOut.filename),
          },
        ],
      };
    } catch (err) {
      return {
        id: spec.id,
        ok: false,
        skipped: !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY,
        error: err instanceof Error ? err.message : "reframe analysis failed",
        logs: `[gemini] ${err instanceof Error ? err.message : "failed"} — set GOOGLE_API_KEY for smart reframing (falling back to center crop).`,
        produced: [],
      };
    }
  }

  /**
   * If the op consumes a crop plan (a .json input with a focalX), build a
   * subject-centered 9:16 crop. Returns null when there's no usable plan, so the
   * caller falls back to the op's own (dumb center-crop) command.
   */
  private async smartReframeCommand(
    spec: OperationSpec,
    outFile: string,
  ): Promise<string | null> {
    const planFile = spec.inputs.find((f) => f.endsWith(".json"));
    if (!planFile) return null;
    let focalX: number | null = null;
    try {
      const raw = await readFile(path.join(this.dir, planFile), "utf8");
      const fx = Number(JSON.parse(raw)?.focalX);
      if (Number.isFinite(fx)) focalX = Math.min(1, Math.max(0, fx));
    } catch {
      return null; // plan missing / unreadable → dumb fallback
    }
    if (focalX == null) return null;
    const video = spec.inputs.find((f) => VIDEO_RE.test(f)) ?? spec.inputs[0];
    // Crop a 9:16 window whose center tracks the subject, then scale to 1080x1920.
    // Single-quoted expr protects the commas from the filtergraph parser.
    const filter =
      `crop=ih*9/16:ih:x='min(max(${focalX}*iw-ih*9/16/2,0),iw-ih*9/16)':y=0,` +
      `scale=1080:1920`;
    return `${this.ffmpegBin} -nostdin -y -i ${quote(video)} -vf "${filter}" ${quote(outFile)}`;
  }

  /** Substitute {in}, {in0..n} and {out} placeholders in a command template. */
  private buildCommand(spec: OperationSpec, outFile: string): string {
    let cmd = (spec.command ?? "").trim();
    if (cmd.startsWith("ffmpeg")) {
      // Inject -nostdin (never block on a prompt — non-interactive exec has no
      // stdin) and -y (auto-overwrite existing outputs on re-runs). Without
      // these, a re-run hangs forever on ffmpeg's "Overwrite? [y/N]" prompt.
      cmd = `${this.ffmpegBin} -nostdin -y${cmd.slice("ffmpeg".length)}`;
    }
    cmd = cmd.replace(/\{in(\d+)\}/g, (_m, i) =>
      quote(spec.inputs[Number(i)] ?? ""),
    );
    cmd = cmd.replace(/\{in\}/g, quote(spec.inputs[0] ?? ""));
    cmd = cmd.replace(/\{out\}/g, quote(outFile));
    return cmd;
  }

  async runPipeline(specs: OperationSpec[]): Promise<OperationResult[]> {
    const results: OperationResult[] = [];
    for (const spec of specs) {
      const r = await this.runOperation(spec);
      results.push(r);
      if (!r.ok) break; // stop the line on the first hard failure
    }
    return results;
  }
}

/** Whether a file exists (and is readable). */
async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Minimal shell-safe single-quoting for POSIX shells. */
function quote(s: string): string {
  if (s === "") return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
