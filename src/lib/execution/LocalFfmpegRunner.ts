import { exec } from "node:child_process";
import { promisify } from "node:util";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RENDERS_DIR, ensureMediaDirs, toPublicUrl } from "@/lib/media";
import {
  langFromFilename,
  languageName,
  mergeSrt,
  toSrt,
  transcribeAudio,
  translateSrt,
} from "@/lib/agent/transcribe";
import { analyzeReframe } from "@/lib/agent/reframe";
import {
  AUDIO_RE,
  SUBTITLE_RE,
  VIDEO_RE,
  applyTemplate,
  bottomLumaProbeCommand,
  parseAvgLuma,
  parseFocalX,
  referencedInputs,
  smartReframeCommand,
  subtitleBurnCommand,
  subtitleStyleFragment,
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
 *   (needs a Gemini API key); they skip cleanly without a key.
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

    // Smart reframe when a crop plan exists; else a deterministic subtitle burn
    // when this is a burner op; else the op's own (model-authored) command.
    let command = await this.reframeCommand(spec, out.filename);
    if (!command) {
      const burn = await this.subtitleBurnCommand(spec, out.filename);
      if (burn === "no-subs") return skipMissing(spec, subtitleInputs(spec));
      if (burn) command = burn;
    }
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
      const stderr = e.stderr ?? "";
      // A common local-setup gotcha: the `subtitles`/`ass` filters need an
      // ffmpeg built with libass. A build without it can't burn subtitles and
      // fails with a cryptic "Unknown filter" / "No option name" — surface the
      // real fix instead.
      const usesLibass = /\b(subtitles|ass)=/.test(command);
      const noFilter =
        /Unknown filter '(subtitles|ass)'|No such filter|No option name/i.test(
          stderr,
        );
      const error =
        usesLibass && noFilter
          ? "This ffmpeg build lacks libass, required to burn subtitles. Reinstall with libass (macOS: `brew reinstall ffmpeg`; verify: `ffmpeg -filters | grep subtitles`)."
          : e.message ?? "ffmpeg failed";
      return {
        id: spec.id,
        ok: false,
        error,
        logs: `$ ${command}\n${stderr}`.trim(),
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

  /**
   * Deterministic subtitle burn when this op takes subtitle track(s) + a video
   * and outputs a video. Returns the command, "no-subs" when none of the
   * subtitle tracks were produced (so the op should skip), or null when this
   * isn't a burner op (fall through to the model's command).
   */
  private async subtitleBurnCommand(
    spec: OperationSpec,
    outFile: string,
  ): Promise<string | "no-subs" | null> {
    const srts = subtitleInputs(spec);
    const video = spec.inputs.find((f) => VIDEO_RE.test(f));
    if (!srts.length || !video || !VIDEO_RE.test(outFile)) return null;
    const present: string[] = [];
    for (const s of srts) {
      if (await exists(path.join(this.dir, s))) present.push(s);
    }
    if (!present.length) return "no-subs";
    // Multiple languages → merge into one 2-line subtitle so they render on
    // adjacent lines (reversed so the last track sits on the top line, e.g.
    // Chinese above English). One language → burn it as-is.
    let burnFiles = present;
    if (present.length > 1) {
      const contents = await Promise.all(
        present.map((f) => readFile(path.join(this.dir, f), "utf8")),
      );
      const mergedName = `${outFile}._subs.srt`;
      await writeFile(
        path.join(this.dir, mergedName),
        mergeSrt([...contents].reverse()),
        "utf8",
      );
      burnFiles = [mergedName];
    }
    const style = spec.subtitleStyle ?? "gold";
    const luma = style === "auto" ? await this.probeBottomLuma(video) : null;
    const fragment = subtitleStyleFragment(style, luma);
    return subtitleBurnCommand(this.ffmpegBin, video, burnFiles, outFile, fragment);
  }

  /** Average luma (0..255) of the video's bottom strip, or null if it fails. */
  private async probeBottomLuma(video: string): Promise<number | null> {
    try {
      const { stderr } = await execAsync(
        bottomLumaProbeCommand(this.ffmpegBin, video),
        { cwd: this.dir, maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
      );
      return parseAvgLuma(stderr);
    } catch {
      return null;
    }
  }

  private async runGemini(spec: OperationSpec): Promise<OperationResult> {
    const subs = spec.outputs.filter((o) => o.media === "subtitle");
    if (subs.length > 0) {
      // audio in → transcribe; subtitle/text in → translate (model may split
      // transcription and translation into separate ops).
      const audio = spec.inputs.find((f) => AUDIO_RE.test(f));
      if (audio) return this.runTranscribe(spec, subs, audio);
      const srtIn = spec.inputs.find((f) => SUBTITLE_RE.test(f));
      if (srtIn) return this.runTranslate(spec, subs, srtIn);
      return skipMissing(spec, spec.inputs.length ? spec.inputs : ["audio"]);
    }
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
    audio: string,
  ): Promise<OperationResult> {
    // The audio wasn't produced (upstream skipped, e.g. no source video) —
    // skip cleanly (amber) rather than erroring on a missing file.
    if (!(await exists(path.join(this.dir, audio)))) {
      return skipMissing(spec, [audio]);
    }
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

  /** Translate an existing subtitle into the op's output language(s). */
  private async runTranslate(
    spec: OperationSpec,
    subs: OperationSpec["outputs"],
    srtIn: string,
  ): Promise<OperationResult> {
    const abs = path.join(this.dir, srtIn);
    if (!(await exists(abs))) return skipMissing(spec, [srtIn]);
    const langs = subs.map((o) => langFromFilename(o.filename));
    try {
      const segments = await translateSrt(await readFile(abs, "utf8"), langs);
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
        logs: `[gemini] translated ${srtIn} → ${langs
          .map(languageName)
          .join(", ")}`,
        produced,
      };
    } catch (err) {
      return geminiSkip(spec.id, err, "translation");
    }
  }

  private async runReframeAnalysis(
    spec: OperationSpec,
    planOut: OperationSpec["outputs"][number],
  ): Promise<OperationResult> {
    const video = spec.inputs.find((f) => VIDEO_RE.test(f)) ?? spec.inputs[0];
    if (!video) return errResult(spec.id, "no video input for reframe analysis");
    // Source video wasn't staged — skip cleanly rather than error on a missing file.
    if (!(await exists(path.join(this.dir, video)))) {
      return skipMissing(spec, [video]);
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

/** Subtitle-track inputs (.srt/.ass/.vtt) of an op, in upstream order. */
export function subtitleInputs(spec: OperationSpec): string[] {
  return spec.inputs.filter((f) => SUBTITLE_RE.test(f));
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
    logs: `[gemini] ${msg} — set GEMINI_API_KEY to enable ${what}.`,
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
