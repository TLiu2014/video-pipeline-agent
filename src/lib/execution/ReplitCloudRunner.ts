import { readFile, writeFile } from "node:fs/promises";
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
import {
  errResult,
  exists,
  geminiSkip,
  skipMissing,
} from "./LocalFfmpegRunner";
import type {
  ExecutorService,
  OperationResult,
  OperationSpec,
  ProducedArtifact,
} from "./types";

interface ExecResponse {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Production adapter (Replit Partner Track).
 *
 * FFmpeg is offloaded to a small executor service running on Replit (see
 * `deploy/replit-executor` + `docs/REPLIT_SETUP.md`); this runner drives it over
 * HTTP: stage the source (upload) → run ffmpeg remotely → download the output
 * for in-browser preview. Gemini calls (transcription / reframe analysis) run
 * locally on the Next server — the API key never leaves your machine — with
 * inputs pulled from, and outputs pushed back to, the remote working dir.
 */
export class ReplitCloudRunner implements ExecutorService {
  readonly mode = "replit" as const;
  private readonly base = (process.env.REPLIT_EXECUTOR_URL || "").replace(
    /\/+$/,
    "",
  );
  private readonly token = process.env.REPLIT_EXECUTOR_TOKEN || "";
  private readonly ffmpegBin = "ffmpeg"; // on PATH inside the Repl
  private readonly localDir = RENDERS_DIR;

  private get configured(): boolean {
    return Boolean(this.base && this.token);
  }
  private auth(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }
  private urlFor(filename: string): string {
    return (
      toPublicUrl(path.join(this.localDir, filename)) ?? `/renders/${filename}`
    );
  }

  /* ── remote executor calls ───────────────────────────────────────────────── */

  private async remoteExec(command: string): Promise<ExecResponse> {
    const res = await fetch(`${this.base}/exec`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.auth() },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(6 * 60 * 1000),
    });
    if (!res.ok) throw new Error(`executor /exec HTTP ${res.status}`);
    return (await res.json()) as ExecResponse;
  }

  private async remoteUpload(filename: string, data: Buffer): Promise<void> {
    const fd = new FormData();
    fd.append("path", filename);
    fd.append("file", new Blob([new Uint8Array(data)]), filename);
    const res = await fetch(`${this.base}/upload`, {
      method: "POST",
      headers: this.auth(),
      body: fd,
      signal: AbortSignal.timeout(3 * 60 * 1000),
    });
    if (!res.ok) throw new Error(`executor /upload HTTP ${res.status}`);
  }

  private async remoteExists(filename: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.base}/exists/${encodeURIComponent(filename)}`,
        { headers: this.auth(), signal: AbortSignal.timeout(30_000) },
      );
      if (!res.ok) return false;
      return ((await res.json()) as { exists?: boolean }).exists === true;
    } catch {
      return false;
    }
  }

  private async remoteDownload(filename: string): Promise<Buffer | null> {
    const res = await fetch(
      `${this.base}/download/${encodeURIComponent(filename)}`,
      { headers: this.auth(), signal: AbortSignal.timeout(3 * 60 * 1000) },
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  /** Ensure a working file is present locally (download it if not), for a
   *  local Gemini call. Returns the local absolute path. */
  private async ensureLocal(filename: string): Promise<string> {
    const local = path.join(this.localDir, filename);
    if (await exists(local)) return local;
    const buf = await this.remoteDownload(filename);
    if (!buf) throw new Error(`remote file not found: ${filename}`);
    await ensureMediaDirs();
    await writeFile(local, buf);
    return local;
  }

  private notConfigured(spec: OperationSpec): OperationResult {
    return {
      id: spec.id,
      ok: false,
      error: "Replit executor not configured",
      logs: "[replit] Set REPLIT_EXECUTOR_URL + REPLIT_EXECUTOR_TOKEN — see docs/REPLIT_SETUP.md.",
      produced: [],
    };
  }

  /* ── ExecutorService ─────────────────────────────────────────────────────── */

  async stageSource(localAbsPath: string, filename: string): Promise<void> {
    if (!this.configured) return; // ops will surface the misconfiguration
    const buf = await readFile(localAbsPath);
    await this.remoteUpload(filename, buf);
    // Keep a local copy too — reused for Gemini inputs + source preview.
    await ensureMediaDirs();
    await writeFile(path.join(this.localDir, filename), buf);
  }

  async runOperation(spec: OperationSpec): Promise<OperationResult> {
    if (!this.configured) return this.notConfigured(spec);
    if (spec.engine === "ffmpeg") return this.runFfmpeg(spec);
    if (spec.engine === "gemini") return this.runGemini(spec);
    return {
      id: spec.id,
      ok: true,
      skipped: true,
      logs: `[replit] "${spec.label}" uses the "${spec.engine}" engine — stubbed.`,
      produced: [],
    };
  }

  /** Run an ffmpeg op on the remote executor, then download its output. */
  private async runFfmpeg(spec: OperationSpec): Promise<OperationResult> {
    const out = spec.outputs[0];
    if (!out) return errResult(spec.id, "ffmpeg operation has no output");

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

    // Skip if referenced inputs weren't produced on the executor.
    const missing: string[] = [];
    for (const f of referencedInputs(command, spec.inputs)) {
      if (!(await this.remoteExists(f))) missing.push(f);
    }
    if (missing.length) return skipMissing(spec, missing);

    let r: ExecResponse;
    try {
      r = await this.remoteExec(command);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "exec failed";
      return {
        id: spec.id,
        ok: false,
        error: msg,
        logs: `[replit] ${msg}`,
        produced: [],
      };
    }
    if (!r.ok) {
      return {
        id: spec.id,
        ok: false,
        error: `remote ffmpeg exited with code ${r.code}`,
        logs: `[replit] $ ${command}\n${(r.stderr || r.stdout || "").trim()}`,
        produced: [],
      };
    }

    // Pull the output back so the browser can preview it via /api/file.
    const buf = await this.remoteDownload(out.filename);
    if (buf) {
      await writeFile(path.join(this.localDir, out.filename), buf).catch(
        () => {},
      );
    }
    return {
      id: spec.id,
      ok: true,
      logs: `[replit] $ ${command}\n${(r.stderr || r.stdout || "").trim()}`.trim(),
      produced: [
        { id: out.id, filename: out.filename, url: this.urlFor(out.filename) },
      ],
    };
  }

  private async reframeCommand(
    spec: OperationSpec,
    outFile: string,
  ): Promise<string | null> {
    const planFile = spec.inputs.find((f) => f.endsWith(".json"));
    if (!planFile) return null;
    const buf = await this.remoteDownload(planFile);
    if (!buf) return null;
    const focal = parseFocalX(buf.toString("utf8"));
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
      logs: `[replit] "${spec.label}" (gemini) has no subtitle or plan output — stubbed.`,
      produced: [],
    };
  }

  /** Transcribe locally (input pulled from the executor, subs pushed back). */
  private async runTranscribe(
    spec: OperationSpec,
    subs: OperationSpec["outputs"],
  ): Promise<OperationResult> {
    const audio = spec.inputs[0];
    if (!audio) return errResult(spec.id, "no audio input for transcription");
    try {
      const localAudio = await this.ensureLocal(audio);
      const langs = subs.map((o) => langFromFilename(o.filename));
      const segments = await transcribeAudio(localAudio, langs);
      const produced: ProducedArtifact[] = [];
      for (const o of subs) {
        const srt = toSrt(segments, langFromFilename(o.filename));
        await writeFile(path.join(this.localDir, o.filename), srt, "utf8");
        await this.remoteUpload(o.filename, Buffer.from(srt, "utf8"));
        produced.push({
          id: o.id,
          filename: o.filename,
          url: this.urlFor(o.filename),
        });
      }
      return {
        id: spec.id,
        ok: true,
        logs: `[gemini→replit] transcribed ${audio} → ${segments.length} segments → ${langs
          .map(languageName)
          .join(", ")}`,
        produced,
      };
    } catch (err) {
      return geminiSkip(spec.id, err, "transcription");
    }
  }

  /** Analyze locally (video pulled from the executor, plan pushed back). */
  private async runReframeAnalysis(
    spec: OperationSpec,
    planOut: OperationSpec["outputs"][number],
  ): Promise<OperationResult> {
    const video = spec.inputs.find((f) => VIDEO_RE.test(f)) ?? spec.inputs[0];
    if (!video) return errResult(spec.id, "no video input for reframe analysis");
    try {
      const localVideo = await this.ensureLocal(video);
      const plan = await analyzeReframe(localVideo);
      const json = JSON.stringify(plan, null, 2);
      await writeFile(path.join(this.localDir, planOut.filename), json, "utf8");
      await this.remoteUpload(planOut.filename, Buffer.from(json, "utf8"));
      return {
        id: spec.id,
        ok: true,
        logs: `[gemini→replit] subject focalX=${plan.focalX.toFixed(2)}${
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
