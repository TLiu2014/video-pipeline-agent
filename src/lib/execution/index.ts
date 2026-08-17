import type { ExecutionMode, ExecutorService } from "./types";
import { LocalFfmpegRunner } from "./LocalFfmpegRunner";
import { ReplitCloudRunner } from "./ReplitCloudRunner";

export type {
  ExecutionMode,
  ExecutorService,
  OperationResult,
  OperationSpec,
  OpOutput,
  ProducedArtifact,
} from "./types";
export { LocalFfmpegRunner } from "./LocalFfmpegRunner";
export { ReplitCloudRunner } from "./ReplitCloudRunner";

/** Resolve the configured execution mode from the environment. */
export function executionMode(): ExecutionMode {
  return process.env.EXECUTION_MODE === "replit" ? "replit" : "local";
}

let cached: ExecutorService | null = null;

/**
 * Factory: return the executor matching EXECUTION_MODE.
 *   local  → LocalFfmpegRunner (child_process FFmpeg)
 *   replit → ReplitCloudRunner (remote workspace)
 */
export function getExecutor(): ExecutorService {
  if (cached) return cached;
  cached =
    executionMode() === "replit"
      ? new ReplitCloudRunner()
      : new LocalFfmpegRunner();
  return cached;
}
