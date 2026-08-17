import type { MediaKind, OperationEngine } from "@/lib/types";

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
  /** Execute a single operation and return its result. */
  runOperation(spec: OperationSpec): Promise<OperationResult>;
  /** Execute a list of operations in the given (already topological) order. */
  runPipeline(specs: OperationSpec[]): Promise<OperationResult[]>;
}
