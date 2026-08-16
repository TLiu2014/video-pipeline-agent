import type { OperationEngine } from "@/lib/types";

/** A single operation to execute, resolved from an Operation node in the DAG. */
export interface OperationSpec {
  id: string;
  label: string;
  engine: OperationEngine;
  /** FFmpeg command template with {in} / {in0..n} / {out} placeholders. */
  command?: string;
  /** Resolved input filenames (relative to the media workspace). */
  inputs: string[];
  /** Desired output filename (relative to the media workspace). */
  output: string;
}

export interface OperationResult {
  id: string;
  ok: boolean;
  /** Filesystem path (local) of the produced artifact, if any. */
  outputPath?: string;
  /** Public URL for previewing the artifact in the browser, if served. */
  outputUrl?: string;
  /** Combined stdout/stderr or remote logs. */
  logs: string;
  error?: string;
  /** True when the op was intentionally not executed (e.g. gemini/tts stub). */
  skipped?: boolean;
}

export type ExecutionMode = "local" | "replit";

/**
 * Execution abstraction shared by the local and remote runners. The rest of the
 * app talks to this interface only, so swapping FFmpeg-on-this-box for a Replit
 * cloud workspace is a one-line factory change (EXECUTION_MODE in .env).
 */
export interface ExecutorService {
  readonly mode: ExecutionMode;
  /** Execute a single operation and return its result. */
  runOperation(spec: OperationSpec): Promise<OperationResult>;
  /** Execute a list of operations in the given (already topological) order. */
  runPipeline(specs: OperationSpec[]): Promise<OperationResult[]>;
}
