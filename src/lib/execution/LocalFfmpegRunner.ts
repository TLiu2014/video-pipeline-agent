import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  ExecutorService,
  OperationResult,
  OperationSpec,
} from "./types";

const execAsync = promisify(exec);

/**
 * Runs operations on the local machine.
 *
 * - "ffmpeg" ops are executed for real via child_process in the media workspace.
 * - "gemini" / "tts" ops are stubbed here (they'd call the Gemini API / a TTS
 *   service); they resolve as skipped so the pipeline can still walk end-to-end
 *   during local development.
 */
export class LocalFfmpegRunner implements ExecutorService {
  readonly mode = "local" as const;
  private readonly mediaDir: string;
  private readonly ffmpegBin: string;

  constructor() {
    this.mediaDir = path.resolve(process.env.MEDIA_DIR || "./public/media");
    this.ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
  }

  /** Substitute {in}, {in0..n} and {out} placeholders in a command template. */
  private buildCommand(spec: OperationSpec): string {
    // A template may hard-code the "ffmpeg" prefix; honor FFMPEG_PATH either way.
    let cmd = (spec.command ?? "").trim();
    if (cmd.startsWith("ffmpeg")) {
      cmd = `${this.ffmpegBin}${cmd.slice("ffmpeg".length)}`;
    }
    cmd = cmd.replace(/\{in(\d+)\}/g, (_m, i) => quote(spec.inputs[Number(i)] ?? ""));
    cmd = cmd.replace(/\{in\}/g, quote(spec.inputs[0] ?? ""));
    cmd = cmd.replace(/\{out\}/g, quote(spec.output));
    return cmd;
  }

  async runOperation(spec: OperationSpec): Promise<OperationResult> {
    if (spec.engine !== "ffmpeg") {
      return {
        id: spec.id,
        ok: true,
        skipped: true,
        logs: `[local] "${spec.label}" uses the "${spec.engine}" engine — not run by the local FFmpeg runner (wire up the Gemini/TTS call here).`,
      };
    }
    if (!spec.command) {
      return {
        id: spec.id,
        ok: false,
        error: "ffmpeg operation has no command template",
        logs: "",
      };
    }

    await mkdir(this.mediaDir, { recursive: true });
    const command = this.buildCommand(spec);
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.mediaDir,
        // FFmpeg writes progress to stderr; give it room + a sane timeout.
        maxBuffer: 32 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      });
      const outputPath = path.join(this.mediaDir, spec.output);
      return {
        id: spec.id,
        ok: true,
        outputPath,
        outputUrl: toPublicUrl(this.mediaDir, spec.output),
        logs: `$ ${command}\n${stderr || stdout}`.trim(),
      };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return {
        id: spec.id,
        ok: false,
        error: e.message ?? "ffmpeg failed",
        logs: `$ ${command}\n${e.stderr ?? ""}`.trim(),
      };
    }
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

/** Map a file inside MEDIA_DIR to its public URL when served from /public. */
function toPublicUrl(mediaDir: string, filename: string): string | undefined {
  const publicRoot = path.resolve("./public");
  const rel = path.relative(publicRoot, path.join(mediaDir, filename));
  if (rel.startsWith("..")) return undefined; // not under /public → not served
  return "/" + rel.split(path.sep).join("/");
}

/** Minimal shell-safe single-quoting for POSIX shells. */
function quote(s: string): string {
  if (s === "") return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
