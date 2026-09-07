import type { MediaKind, OperationEngine } from "@/lib/types";

/**
 * Burned-in subtitle color (always with a black outline for contrast):
 *   gold/white/cyan → that text color
 *   auto            → probe the video's bottom-strip brightness; gold on dark
 *                     footage, dark text on a white outline over bright footage
 */
export type SubtitleStyle = "gold" | "white" | "cyan" | "auto";

/** A downstream resource an operation is expected to produce. */
export interface OpOutput {
  /** Resource node id. */
  id: string;
  /** Output filename (relative to the run working dir). */
  filename: string;
  media: MediaKind;
}

/** A single operation to execute, resolved from an Operation node in the DAG. */
export interface OperationSpec {
  id: string;
  label: string;
  engine: OperationEngine;
  /** FFmpeg command template with {in} / {in0..n} / {out} placeholders. */
  command?: string;
  /** Input filenames (relative to the run working dir). */
  inputs: string[];
  /** Downstream resource(s) this op produces. */
  outputs: OpOutput[];
  /** How to color burned subtitles (burner ops only). Default "gold". */
  subtitleStyle?: SubtitleStyle;
  /** Explicit subtitle FontSize (ASS force_style) for a burner op; omit = default. */
  subtitleFontSize?: number;
}

/** A produced artifact, keyed back to its resource node. */
export interface ProducedArtifact {
  /** Resource node id. */
  id: string;
  filename: string;
  /** Served URL for preview (e.g. /renders/subtitled.mp4). */
  url: string;
}

export interface OperationResult {
  /** Operation node id. */
  id: string;
  ok: boolean;
  /** True when the op was intentionally not executed (e.g. tts stub). */
  skipped?: boolean;
  /** Combined stdout/stderr or remote logs. */
  logs: string;
  error?: string;
  /** Artifacts produced, mapped to their downstream resource nodes. */
  produced: ProducedArtifact[];
}

export type ExecutionMode = "local" | "replit";

/**
 * Execution abstraction shared by the local and remote runners. The rest of the
 * app talks to this interface only, so swapping FFmpeg-on-this-box for a Replit
 * cloud workspace is a one-line factory change (EXECUTION_MODE in .env).
 */
export interface ExecutorService {
  readonly mode: ExecutionMode;
  /** Place the loaded source video into the working dir under `filename`
   *  (copy locally, upload to the remote executor for Replit). */
  stageSource(localAbsPath: string, filename: string): Promise<void>;
  /** Execute a single operation and return its result. */
  runOperation(spec: OperationSpec): Promise<OperationResult>;
  /** Execute a list of operations in the given (already topological) order. */
  runPipeline(specs: OperationSpec[]): Promise<OperationResult[]>;
}
