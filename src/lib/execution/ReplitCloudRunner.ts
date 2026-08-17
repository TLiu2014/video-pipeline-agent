import type {
  ExecutorService,
  OperationResult,
  OperationSpec,
} from "./types";

/**
 * Production adapter (Replit Partner Track).
 *
 * Intended flow — autonomously offload the generated FFmpeg scripts to a Replit
 * cloud workspace:
 *   1. Ensure a workspace/repl exists (reuse REPLIT_WORKSPACE_ID or create one).
 *   2. Upload the source media + write the FFmpeg script into the workspace.
 *   3. Execute the script remotely (exec endpoint).
 *   4. Download the produced artifact and expose it back to the UI.
 *
 * The network calls are STUBBED — the shape and TODOs are in place so the real
 * Replit API wiring can be dropped in without touching the rest of the app.
 */
export class ReplitCloudRunner implements ExecutorService {
  readonly mode = "replit" as const;
  private readonly token: string | undefined;
  private readonly apiBase: string;
  private readonly workspaceId: string | undefined;

  constructor() {
    this.token = process.env.REPLIT_API_TOKEN;
    this.apiBase = process.env.REPLIT_API_BASE || "https://api.replit.com";
    this.workspaceId = process.env.REPLIT_WORKSPACE_ID;
  }

  private notConfigured(spec: OperationSpec, extra = ""): OperationResult {
    return {
      id: spec.id,
      ok: false,
      error: "Replit runner not configured",
      produced: [],
      logs:
        `[replit] Would run "${spec.label}" on a cloud workspace.\n` +
        `Set REPLIT_API_TOKEN (and optionally REPLIT_WORKSPACE_ID) to enable.` +
        (extra ? `\n${extra}` : ""),
    };
  }

  /** Ensure a workspace exists; create one on demand. STUB. */
  private async ensureWorkspace(): Promise<string> {
    if (this.workspaceId) return this.workspaceId;
    // TODO: POST `${this.apiBase}/v1/workspaces` with auth, return the new id.
    throw new Error("workspace provisioning not implemented");
  }

  /** Push a file's contents into the workspace. STUB. */
  private async pushFile(
    _workspaceId: string,
    _remotePath: string,
    _contents: string | Buffer,
  ): Promise<void> {
    // TODO: PUT `${this.apiBase}/v1/workspaces/{id}/files/{path}` with auth.
    throw new Error("file push not implemented");
  }

  /** Execute a shell command in the workspace and return combined logs. STUB. */
  private async execRemote(
    _workspaceId: string,
    _command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // TODO: POST `${this.apiBase}/v1/workspaces/{id}/exec` { command }, poll/stream.
    throw new Error("remote exec not implemented");
  }

  async runOperation(spec: OperationSpec): Promise<OperationResult> {
    if (!this.token) return this.notConfigured(spec);

    try {
      const workspaceId = await this.ensureWorkspace();
      const command = spec.command ?? "";
      await this.pushFile(workspaceId, `scripts/${spec.id}.sh`, command);
      const { stdout, stderr, exitCode } = await this.execRemote(
        workspaceId,
        `bash scripts/${spec.id}.sh`,
      );
      // TODO: download the produced artifacts and host them (e.g. signed URLs).
      return {
        id: spec.id,
        ok: exitCode === 0,
        logs: `${stdout}\n${stderr}`.trim(),
        error: exitCode === 0 ? undefined : `exited with code ${exitCode}`,
        produced: [],
      };
    } catch (err) {
      return this.notConfigured(
        spec,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async runPipeline(specs: OperationSpec[]): Promise<OperationResult[]> {
    const results: OperationResult[] = [];
    for (const spec of specs) {
      const r = await this.runOperation(spec);
      results.push(r);
      if (!r.ok) break;
    }
    return results;
  }
}
