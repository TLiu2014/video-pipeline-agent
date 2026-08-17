import { NextResponse } from "next/server";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import {
  executionMode,
  getExecutor,
  type OperationSpec,
} from "@/lib/execution";
import type { OpOutput } from "@/lib/execution/types";
import {
  RENDERS_DIR,
  ensureMediaDirs,
  fromPublicUrl,
} from "@/lib/media";
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
  let dag: GeneratedDag | undefined;
  let sourceUrl: string | null = null;
  try {
    const body = await req.json();
    dag = body?.dag as GeneratedDag | undefined;
    sourceUrl = typeof body?.sourceUrl === "string" ? body.sourceUrl : null;
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

  // Stage the loaded source into the renders dir under each root resource's
  // filename, so downstream ops read it by that name.
  if (sourceUrl) {
    const abs = fromPublicUrl(sourceUrl);
    if (abs) {
      const roots = dag.nodes.filter(
        (n) => n.type === "resource" && !(upstream.get(n.id)?.length ?? 0),
      );
      await Promise.all(
        roots.map((n) =>
          copyFile(
            abs,
            path.join(RENDERS_DIR, filenameOf.get(n.id) ?? `${n.id}.mp4`),
          ).catch(() => {}),
        ),
      );
    }
  }

  const order = topoSort(dag);
  const specs: OperationSpec[] = order
    .filter((id) => typeOf.get(id) === "operation")
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
      };
    });

  const executor = getExecutor();
  const mode = executionMode();

  // Stream NDJSON events so the UI shows live progress + logs and can follow the
  // in-progress node, instead of blocking on the whole pipeline.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
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
