import { exec } from "node:child_process";
import { promisify } from "node:util";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RENDERS_DIR, ensureMediaDirs, toPublicUrl } from "@/lib/media";
import {
  langFromFilename,
  languageName,
  toSrt,
  transcribeAudio,
} from "@/lib/agent/transcribe";
import { analyzeReframe } from "@/lib/agent/reframe";
import {
  VIDEO_RE,
  applyTemplate,
  parseFocalX,
  referencedInputs,
  smartReframeCommand,
} from "./ffmpegCommand";
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
 * - "gemini" ops produce real subtitles (transcription) or a reframe crop plan
 *   (needs GOOGLE_API_KEY); they skip cleanly without a key.
 * - "tts" ops are stubbed (wire a TTS service here for AI dubbing).
 */
export class LocalFfmpegRunner implements ExecutorService {
  readonly mode = "local" as const;
  private readonly dir = RENDERS_DIR;
  private readonly ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";

  private urlFor(filename: string): string {
    return toPublicUrl(path.join(this.dir, filename)) ?? `/renders/${filename}`;
  }

  /** Stage the loaded source into the working dir under its pipeline filename. */
  async stageSource(localAbsPath: string, filename: string): Promise<void> {
    await ensureMediaDirs();
    await copyFile(localAbsPath, path.join(this.dir, filename));
  }

  async runOperation(spec: OperationSpec): Promise<OperationResult> {
    await ensureMediaDirs();
    if (spec.engine === "ffmpeg") return this.runFfmpeg(spec);
    if (spec.engine === "gemini") return this.runGemini(spec);
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
      return errResult(spec.id, "ffmpeg operation has no output");
    }

    // Smart reframe when a crop plan exists; else the op's own (dumb) command.
    let command = await this.reframeCommand(spec, out.filename);
    if (!command) {
      if (!spec.command)
        return errResult(spec.id, "ffmpeg operation missing command");
      command = applyTemplate(
        this.ffmpegBin,
        spec.command,
        spec.inputs,
        out.filename,
      );
    }

    // Skip if inputs the command references weren't produced (e.g. burner with
    // no subs). Optional inputs (the crop plan) aren't referenced → don't gate.
    const missing: string[] = [];
    for (const f of referencedInputs(command, spec.inputs)) {
      if (!(await exists(path.join(this.dir, f)))) missing.push(f);
    }
    if (missing.length) return skipMissing(spec, missing);

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

  /** Build the smart-reframe command if a usable crop plan is present. */
  private async reframeCommand(
    spec: OperationSpec,
    outFile: string,
  ): Promise<string | null> {
    const planFile = spec.inputs.find((f) => f.endsWith(".json"));
    if (!planFile) return null;
    let focal: number | null = null;
    try {
      focal = parseFocalX(await readFile(path.join(this.dir, planFile), "utf8"));
    } catch {
      return null;
    }
    if (focal == null) return null;
    const video = spec.inputs.find((f) => VIDEO_RE.test(f)) ?? spec.inputs[0];
    return smartReframeCommand(this.ffmpegBin, video, outFile, focal);
  }

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

  private async runTranscribe(
    spec: OperationSpec,
    subs: OperationSpec["outputs"],
  ): Promise<OperationResult> {
    const audio = spec.inputs[0];
    if (!audio) return errResult(spec.id, "no audio input for transcription");
    const langs = subs.map((o) => langFromFilename(o.filename));
    try {
      const segments = await transcribeAudio(path.join(this.dir, audio), langs);
      const produced: ProducedArtifact[] = [];
      for (const o of subs) {
        const srt = toSrt(segments, langFromFilename(o.filename));
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
      return geminiSkip(spec.id, err, "transcription");
    }
  }

  private async runReframeAnalysis(
    spec: OperationSpec,
    planOut: OperationSpec["outputs"][number],
  ): Promise<OperationResult> {
    const video = spec.inputs.find((f) => VIDEO_RE.test(f)) ?? spec.inputs[0];
    if (!video) return errResult(spec.id, "no video input for reframe analysis");
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
      return geminiSkip(spec.id, err, "reframe");
    }
  }

  async runPipeline(specs: OperationSpec[]): Promise<OperationResult[]> {
    const results: OperationResult[] = [];
    for (const spec of specs) {
      const r = await this.runOperation(spec);
      results.push(r);
      if (!r.ok && !r.skipped) break;
    }
    return results;
  }
}

/* ── shared result helpers (used by both runners) ──────────────────────────── */

export function errResult(id: string, error: string): OperationResult {
  return { id, ok: false, error, logs: "", produced: [] };
}

export function skipMissing(
  spec: OperationSpec,
  missing: string[],
): OperationResult {
  return {
    id: spec.id,
    ok: true,
    skipped: true,
    error: `needs ${missing.join(", ")}`,
    logs: `"${spec.label}" not run — missing input(s): ${missing.join(
      ", ",
    )}. Produce them first (an earlier stage didn't complete).`,
    produced: [],
  };
}

export function geminiSkip(
  id: string,
  err: unknown,
  what: string,
): OperationResult {
  const msg = err instanceof Error ? err.message : `${what} failed`;
  return {
    id,
    ok: false,
    skipped: !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY,
    error: msg,
    logs: `[gemini] ${msg} — set GOOGLE_API_KEY to enable ${what}.`,
    produced: [],
  };
}

/** Whether a file exists (and is readable). */
export async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
