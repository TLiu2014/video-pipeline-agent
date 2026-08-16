"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Header } from "./Header";
import { PipelineCanvas } from "./PipelineCanvas";
import { SidePanel, type TraceEntry, type TraceStatus } from "./SidePanel";
import type { AppSettings } from "./SettingsMenu";
import {
  DEFAULT_SAMPLE_ID,
  hydrateDag,
  sampleById,
  type SampleId,
} from "@/lib/dag";
import type {
  GeneratedDag,
  GenerateDagResponse,
  NodeStatus,
  PipelineEdge,
  PipelineFlowNode,
} from "@/lib/types";

interface BuilderProps {
  executionMode: string;
  model: string;
}

interface ExecResult {
  id: string;
  ok: boolean;
  error?: string;
  outputUrl?: string;
  skipped?: boolean;
}

export function Builder({ executionMode, model }: BuilderProps) {
  const initialDag = sampleById(DEFAULT_SAMPLE_ID);
  const initial = useMemo(() => hydrateDag(initialDag), [initialDag]);
  const [prompt, setPrompt] = useState("");
  const [dag, setDag] = useState<GeneratedDag>(initialDag);
  const [nodes, setNodes] = useState<PipelineFlowNode[]>(initial.nodes);
  const [edges, setEdges] = useState<PipelineEdge[]>(initial.edges);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [refitKey, setRefitKey] = useState(0);
  const [sample, setSample] = useState<SampleId>(DEFAULT_SAMPLE_ID);
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    animateEdges: true,
    autoFit: true,
  });

  const idRef = useRef(0);
  const nextId = () => `e${idRef.current++}`;
  const push = useCallback((e: Omit<TraceEntry, "id">) => {
    const id = nextId();
    setEntries((prev) => [...prev, { ...e, id }]);
    return id;
  }, []);
  const update = useCallback(
    (id: string, patch: Partial<TraceEntry>) =>
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      ),
    [],
  );

  const onSettingsChange = useCallback(
    (next: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...next })),
    [],
  );

  const applyDag = useCallback(
    (next: GeneratedDag) => {
      const { nodes: n, edges: e } = hydrateDag(next);
      setDag(next);
      setNodes(n);
      setEdges(e);
      if (settings.autoFit) setRefitKey((k) => k + 1);
    },
    [settings.autoFit],
  );

  // Switch the canvas to a sample pipeline (or empty) from the settings menu.
  const onSampleChange = useCallback(
    (id: SampleId) => {
      setSample(id);
      applyDag(sampleById(id));
      setEntries([]);
    },
    [applyDag],
  );

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (!text || loading) return;
    push({ kind: "user", text });
    setPrompt("");
    setLoading(true);
    try {
      const res = await fetch("/api/generate-dag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data: GenerateDagResponse = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error);
      applyDag(data.dag);
      setSample("empty"); // generated pipeline is no longer a named sample
      const count = data.dag.nodes.length;
      push({
        kind: "trace",
        status: "done",
        text: `Built “${data.dag.title}” · ${count} nodes`,
      });
      push({
        kind: "assistant",
        text: data.fallback
          ? data.note ?? "Showing a sample pipeline (no API key configured)."
          : data.dag.summary || "Pipeline ready — press Run to execute.",
      });
    } catch (err) {
      push({
        kind: "trace",
        status: "failed",
        text: `Generation failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      });
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, push, applyDag]);

  const run = useCallback(async () => {
    if (running || nodes.length === 0) return;
    setRunning(true);
    // Optimistically queue every operation node + open a trace row.
    setNodes((prev) =>
      prev.map((n) =>
        n.type === "operation"
          ? { ...n, data: { ...n.data, status: "queued" as NodeStatus } }
          : n,
      ),
    );
    const runningId = push({
      kind: "trace",
      status: "doing",
      text: `Executing pipeline on ${
        executionMode === "replit" ? "Replit Cloud" : "Local FFmpeg"
      }…`,
    });
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dag }),
      });
      const data: { mode: string; results: ExecResult[] } = await res.json();
      const results = data.results ?? [];
      applyResults(results);

      const labelOf = new Map(nodes.map((n) => [n.id, n.data.label]));
      const failed = results.filter((r) => !r.ok && !r.skipped);
      update(runningId, {
        status: failed.length ? "failed" : "done",
        text: failed.length
          ? `Ran on ${data.mode} — ${failed.length} failed`
          : `Ran on ${data.mode} — all steps done`,
      });
      for (const r of results) {
        const status: TraceStatus = r.skipped
          ? "done"
          : r.ok
            ? "done"
            : "failed";
        push({
          kind: "trace",
          status,
          text: `${labelOf.get(r.id) ?? r.id}${r.skipped ? " (skipped)" : ""}`,
          detail: r.ok ? r.outputUrl ?? undefined : r.error ?? undefined,
        });
      }
    } catch (err) {
      update(runningId, {
        status: "failed",
        text: `Execution failed: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      });
    } finally {
      setRunning(false);
    }
  }, [running, nodes, dag, executionMode, push, update]);

  /** Fold execution results back into node statuses. */
  const applyResults = useCallback(
    (results: ExecResult[]) => {
      const byId = new Map(results.map((r) => [r.id, r]));
      const feeders = new Map<string, string[]>();
      const opIds = new Set(
        nodes.filter((n) => n.type === "operation").map((n) => n.id),
      );
      for (const e of edges) {
        if (opIds.has(e.source)) {
          const arr = feeders.get(e.target) ?? [];
          arr.push(e.source);
          feeders.set(e.target, arr);
        }
      }
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type === "operation") {
            const r = byId.get(n.id);
            const status: NodeStatus = !r
              ? "idle"
              : r.ok || r.skipped
                ? "done"
                : "failed";
            return {
              ...n,
              data: { ...n.data, status, error: r?.ok ? null : r?.error ?? null },
            };
          }
          const ops = feeders.get(n.id) ?? [];
          let status: NodeStatus = "done";
          let outputUrl = n.data.outputUrl ?? null;
          if (ops.length) {
            const rs = ops.map((id) => byId.get(id));
            if (rs.some((r) => r && !r.ok && !r.skipped)) status = "failed";
            else if (rs.some((r) => !r)) status = "idle";
            else status = "done";
            const produced = rs.find((r) => r?.outputUrl)?.outputUrl;
            if (produced) outputUrl = produced;
          }
          return { ...n, data: { ...n.data, status, outputUrl } };
        }),
      );
    },
    [nodes, edges],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Header
        settings={settings}
        onSettingsChange={onSettingsChange}
        sample={sample}
        onSampleChange={onSampleChange}
        executionMode={executionMode}
        model={model}
      />

      <div className="flex min-h-0 flex-1">
        <div className="w-[340px] shrink-0">
          <SidePanel
            prompt={prompt}
            onPromptChange={setPrompt}
            onGenerate={generate}
            onRun={run}
            onReset={() => setEntries([])}
            loading={loading}
            running={running}
            entries={entries}
            executionMode={executionMode}
            canRun={nodes.length > 0}
          />
        </div>

        <main className="relative min-h-0 flex-1">
          <PipelineCanvas
            nodes={nodes}
            edges={edges}
            animateEdges={settings.animateEdges}
            refitKey={refitKey}
          />

          {nodes.length > 0 && (
            <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm">
              <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {dag.title}
                    </div>
                    {dag.summary && (
                      <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                        {dag.summary}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
