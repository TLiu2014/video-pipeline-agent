import { NextResponse } from "next/server";
import {
  executionMode,
  getExecutor,
  type OperationSpec,
} from "@/lib/execution";
import type { GeneratedDag } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/execute
 * Body: { dag: GeneratedDag }
 *
 * Walks the DAG in topological order, turns each Operation node into an
 * OperationSpec (inputs = upstream resource filenames, output = downstream
 * resource filename) and runs it through the configured ExecutorService.
 */
export async function POST(req: Request) {
  let dag: GeneratedDag | undefined;
  try {
    const body = await req.json();
    dag = body?.dag as GeneratedDag | undefined;
  } catch {
    /* handled below */
  }
  if (!dag?.nodes?.length) {
    return NextResponse.json({ error: "Missing 'dag' in body." }, { status: 400 });
  }

  const filenameOf = new Map<string, string>();
  const typeOf = new Map<string, "resource" | "operation">();
  for (const n of dag.nodes) {
    typeOf.set(n.id, n.type);
    if (n.type === "resource") {
      filenameOf.set(n.id, String(n.data?.filename ?? `${n.id}.out`));
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

  // Topologically order the operation nodes by walking the DAG (Kahn's algo on
  // the full graph, then keep only operations).
  const order = topoSort(dag);
  const specs: OperationSpec[] = order
    .filter((id) => typeOf.get(id) === "operation")
    .map((id) => {
      const node = dag!.nodes.find((n) => n.id === id)!;
      const inputs = (upstream.get(id) ?? [])
        .map((rid) => filenameOf.get(rid))
        .filter((f): f is string => Boolean(f));
      const outId = (downstream.get(id) ?? []).find((d) =>
        filenameOf.has(d),
      );
      const output = outId ? filenameOf.get(outId)! : `${id}.out`;
      return {
        id,
        label: String(node.data?.label ?? id),
        engine: (node.data?.engine as OperationSpec["engine"]) ?? "ffmpeg",
        command: node.data?.command ? String(node.data.command) : undefined,
        inputs,
        output,
      };
    });

  const executor = getExecutor();
  const results = await executor.runPipeline(specs);
  return NextResponse.json({ mode: executionMode(), results });
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
  // Append any nodes left out by a cycle so nothing silently disappears.
  for (const n of dag.nodes) if (!out.includes(n.id)) out.push(n.id);
  return out;
}
