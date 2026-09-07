import { NextResponse } from "next/server";
import {
  executionMode,
  getExecutor,
  type OperationSpec,
} from "@/lib/execution";
import type { OpOutput, SubtitleStyle } from "@/lib/execution/types";
import { apiKeyFromRequest, runWithApiKey } from "@/lib/agent/keyContext";
import { RENDERS_DIR, ensureMediaDirs, fromPublicUrl } from "@/lib/media";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { GeneratedDag, MediaKind } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/execute  { dag, sourceUrl? }
 *
 * Copies the loaded source video into the renders working dir under each root
 * resource node's filename, walks the DAG in topological order, turns each
 * Operation node into an OperationSpec (inputs = upstream resource filenames,
 * outputs = downstream resource nodes) and runs it through the ExecutorService.
 */
export async function POST(req: Request) {
  const clientKey = apiKeyFromRequest(req);
  let dag: GeneratedDag | undefined;
  let sourceUrl: string | null = null;
  let subtitleStyle: SubtitleStyle = "gold";
  let fromNode: string | null = null;
  try {
    const body = await req.json();
    dag = body?.dag as GeneratedDag | undefined;
    sourceUrl = typeof body?.sourceUrl === "string" ? body.sourceUrl : null;
    if (["gold", "white", "cyan", "auto"].includes(body?.subtitleStyle)) {
      subtitleStyle = body.subtitleStyle;
    }
    // Partial re-run: only run ops downstream of this node (e.g. after editing
    // a subtitle — re-burn without re-running Gemini/earlier steps).
    fromNode = typeof body?.fromNode === "string" ? body.fromNode : null;
  } catch {
    /* handled below */
  }
  if (!dag?.nodes?.length) {
    return NextResponse.json({ error: "Missing 'dag' in body." }, { status: 400 });
  }

  const typeOf = new Map<string, "resource" | "operation">();
  const filenameOf = new Map<string, string>();
  const mediaOf = new Map<string, MediaKind>();
  for (const n of dag.nodes) {
    typeOf.set(n.id, n.type);
    if (n.type === "resource") {
      filenameOf.set(n.id, String(n.data?.filename ?? `${n.id}.out`));
      mediaOf.set(n.id, (n.data?.media as MediaKind) ?? "video");
    }
  }

  const upstream = new Map<string, string[]>();
  const downstream = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const e of dag.edges) {
    push(upstream, e.target, e.source);
    push(downstream, e.source, e.target);
  }

  await ensureMediaDirs();
  const executor = getExecutor();

  // Full run: wipe this pipeline's prior artifacts so a run can't "pass" a node
  // by reusing a stale file (e.g. running with no source video shouldn't leave
  // last run's audio/subs around making downstream nodes look done). A partial
  // re-run (fromNode) deliberately KEEPS upstream files.
  if (!fromNode) {
    await Promise.all(
      [...new Set(filenameOf.values())].map((f) =>
        unlink(path.join(RENDERS_DIR, f)).catch(() => {}),
      ),
    );
  }

  // Stage the loaded source into the working dir under each root resource's
  // filename (copied locally, or uploaded to the Replit executor).
  if (sourceUrl) {
    const abs = fromPublicUrl(sourceUrl);
    if (abs) {
      // Stage into (a) whatever resource the client bound the source to
      // (its outputUrl === the sourceUrl), plus (b) any root resource with no
      // incoming edge. (a) is robust even if the model wired the source node
      // with a stray edge so it isn't a clean root.
      const cleanUrl = sourceUrl.split("?")[0];
      const roots = dag.nodes.filter(
        (n) =>
          n.type === "resource" &&
          (String((n.data as { outputUrl?: string }).outputUrl ?? "").split(
            "?",
          )[0] === cleanUrl ||
            !(upstream.get(n.id)?.length ?? 0)),
      );
      await Promise.all(
        roots.map((n) =>
          executor
            .stageSource(abs, filenameOf.get(n.id) ?? `${n.id}.mp4`)
            .catch(() => {}),
        ),
      );
    }
  }

  // For a partial re-run, restrict to operations reachable downstream of
  // `fromNode` (their upstream inputs already exist on disk from a prior run).
  const allowed = fromNode ? downstreamIds(fromNode, dag) : null;

  const order = topoSort(dag);
  const specs: OperationSpec[] = order
    .filter((id) => typeOf.get(id) === "operation")
    .filter((id) => !allowed || allowed.has(id))
    .map((id) => {
      const node = dag!.nodes.find((n) => n.id === id)!;
      const inputs = (upstream.get(id) ?? [])
        .map((rid) => filenameOf.get(rid))
        .filter((f): f is string => Boolean(f));
      const outputs: OpOutput[] = (downstream.get(id) ?? [])
        .filter((rid) => typeOf.get(rid) === "resource")
        .map((rid) => ({
          id: rid,
          filename: filenameOf.get(rid) ?? `${rid}.out`,
          media: mediaOf.get(rid) ?? "video",
        }));
      return {
        id,
        label: String(node.data?.label ?? id),
        engine: (node.data?.engine as OperationSpec["engine"]) ?? "ffmpeg",
        command: node.data?.command ? String(node.data.command) : undefined,
        inputs,
        outputs,
        subtitleStyle,
      };
    });

  const mode = executionMode();

  // Stream NDJSON events so the UI shows live progress + logs and can follow the
  // in-progress node, instead of blocking on the whole pipeline.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      // Run the loop under the BYOK context so Gemini ops (transcribe / reframe)
      // deep in the executor pick up the client's key.
      await runWithApiKey(clientKey, async () => {
        send({ type: "start", mode, count: specs.length });
        try {
          for (const spec of specs) {
            send({ type: "op-start", id: spec.id, label: spec.label });
            const r = await executor.runOperation(spec);
            send({ type: "op-done", ...r });
            // Continue past a *skipped* step (e.g. Gemini with no key) so the
            // downstream ffmpeg can still run its fallback; only a hard failure
            // stops the line.
            if (!r.ok && !r.skipped) break;
          }
        } catch (err) {
          send({
            type: "error",
            error: err instanceof Error ? err.message : "execution failed",
          });
        }
        send({ type: "done", mode });
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** All node ids reachable downstream of `fromId` (inclusive of its consumers). */
function downstreamIds(fromId: string, dag: GeneratedDag): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of dag.edges) {
    const arr = adj.get(e.source);
    if (arr) arr.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const seen = new Set<string>();
  const queue = [...(adj.get(fromId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const nx of adj.get(id) ?? []) queue.push(nx);
  }
  return seen;
}

/** Kahn's topological sort over the full node set. */
function topoSort(dag: GeneratedDag): string[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of dag.edges) {
    if (!adj.has(e.source) || !indeg.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const q = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const out: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const nx of adj.get(id) ?? []) {
      indeg.set(nx, (indeg.get(nx) ?? 1) - 1);
      if ((indeg.get(nx) ?? 0) === 0) q.push(nx);
    }
  }
  for (const n of dag.nodes) if (!out.includes(n.id)) out.push(n.id);
  return out;
}
