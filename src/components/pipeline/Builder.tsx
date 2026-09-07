"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Header } from "./Header";
import { PipelineCanvas } from "./PipelineCanvas";
import { SidePanel, type TraceEntry, type TraceStatus } from "./SidePanel";
import { ResultsPanel, SOURCES_TAB, type PreviewItem } from "./ResultsPanel";
import { CanvasExportToolbar } from "./CanvasExportToolbar";
import type { AppSettings } from "./SettingsMenu";
import { parsePipelineFile } from "@/lib/pipelineFile";
import { useDragResize } from "@/hooks/useDragResize";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SAMPLE_ID,
  SAMPLES,
  hydrateDag,
  sampleById,
  type SampleId,
} from "@/lib/dag";
import type {
  GeneratedDag,
  GenerateDagResponse,
  LoadedSource,
  NodeStatus,
  PipelineEdge,
  PipelineFlowNode,
} from "@/lib/types";

interface BuilderProps {
  executionMode: string;
  model: string;
  maxUploadMb: number;
  /** Whether the server already has a Gemini key in env (GEMINI_API_KEY). */
  hasServerKey: boolean;
}

/** BYOK key persisted in this browser only. */
const GEMINI_KEY_STORAGE = "video-agent:gemini-key";
/** Last sample pipeline the user selected — restored on reload. */
const SAMPLE_STORAGE = "video-agent:sample";
const SAMPLE_IDS = new Set<string>(SAMPLES.map((s) => s.id));

/** An operation's result carried by the `op-done` stream event. */
interface OpEvent {
  type?: "op-done";
  id: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  logs?: string;
  produced?: Array<{ id: string; filename: string; url: string }>;
}

type StreamEvent =
  | { type: "start"; mode: string; count: number }
  | { type: "op-start"; id: string; label: string }
  | ({ type: "op-done" } & OpEvent)
  | { type: "error"; error: string }
  | { type: "done"; mode: string };

/** Keep the last few lines of a log for the trace detail. */
function tailLog(logs?: string): string | undefined {
  if (!logs) return undefined;
  const lines = logs.trim().split("\n");
  return lines.slice(-6).join("\n");
}

/** After a run, focus the artifact produced by the last executed op. */
function lastFocusId(
  lastOpId: string | null,
  edges: PipelineEdge[],
): string | null {
  if (!lastOpId) return null;
  return edges.find((e) => e.source === lastOpId)?.target ?? lastOpId;
}

export function Builder({
  executionMode,
  model,
  maxUploadMb,
  hasServerKey,
}: BuilderProps) {
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
  const [source, setSource] = useState<LoadedSource | null>(null);
  // Open the preview on the Sources tab by default so the first thing a user
  // does is pick a clip (the left source-loader is hidden by default).
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(SOURCES_TAB);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  // BYOK Gemini key — hydrated from localStorage on mount (never during SSR).
  const [apiKey, setApiKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GEMINI_KEY_STORAGE);
      if (saved) setApiKey(saved);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, []);
  const onApiKeySet = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKey(trimmed || null);
    try {
      if (trimmed) localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
      else localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch {
      /* ignore */
    }
  }, []);
  const [settings, setSettings] = useState<AppSettings>({
    animateEdges: true,
    autoFit: true,
    // main area (node-editor convention); the preview/sources sit alongside it.
    resultsLayout: "bottom",
    followActive: true,
    // Source picking lives in the preview's Sources tab, so hide the left one.
    showSourceLoader: false,
    // Gold (#F2C84B) subtitles by default — high-contrast on most footage.
    subtitleStyle: "gold",
  });

  // Resizable dividers: side panel width, and the results pane size. The results
  // divider's axis + drag direction depend on where the pane is docked.
  const sidePanel = useDragResize({
    axis: "x",
    initial: 340,
    min: 280,
    max: 560,
  });
  const resultsPane = useDragResize({
    axis: settings.resultsLayout === "right" ? "x" : "y",
    initial: 360,
    min: 200,
    max: 760,
    // A pane docked right/bottom grows as you drag toward it (inverted); a
    // top-docked pane grows as you drag down (not inverted).
    invert: settings.resultsLayout !== "top",
  });

  const idRef = useRef(0);
  const nextId = () => `e${idRef.current++}`;
  // Latches once we auto-reveal the preview pane during a run, so we open it at
  // most once — after that, whether it's open is the user's call (a manual close
  // is respected and never re-opened until the next run).
  const autoRevealedRef = useRef(false);
  // Monotonic per-run token appended to produced URLs so re-runs always show the
  // fresh artifact (the filenames are stable, so the URL alone wouldn't change).
  const runTokenRef = useRef(0);
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
      // Keep any already-loaded source bound to the new pipeline's roots.
      setDag(next);
      setNodes(source ? bindSourceToRoots(n, e, source) : n);
      setEdges(e);
      if (settings.autoFit) setRefitKey((k) => k + 1);
    },
    [settings.autoFit, source],
  );

  // Switch the canvas to a sample pipeline (or empty) from the settings menu,
  // and remember the choice so a page reload restores the same starting sample.
  const onSampleChange = useCallback(
    (id: SampleId) => {
      setSample(id);
      applyDag(sampleById(id));
      setEntries([]);
      try {
        localStorage.setItem(SAMPLE_STORAGE, id);
      } catch {
        /* ignore */
      }
    },
    [applyDag],
  );

  // On mount, restore the last-selected sample from localStorage (never in SSR).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAMPLE_STORAGE);
      if (saved && saved !== DEFAULT_SAMPLE_ID && SAMPLE_IDS.has(saved)) {
        setSample(saved as SampleId);
        applyDag(sampleById(saved as SampleId));
      }
    } catch {
      /* ignore */
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New chat: clear the trace and reset the pipeline to the selected sample
  // (choose "Empty canvas" as the sample to clear to a blank canvas).
  const onNewChat = useCallback(() => {
    setEntries([]);
    applyDag(sampleById(sample));
    setPreviewNodeId(SOURCES_TAB);
    setActiveNodeId(null);
  }, [applyDag, sample]);

  // ─── Canvas import ──────────────────────────────────────────────────────
  // Load a pipeline JSON back onto the canvas (export lives in the on-canvas
  // toolbar, which owns its own preview dialog).
  const importFile = useCallback(
    async (file: File) => {
      try {
        const imported = parsePipelineFile(await file.text());
        applyDag(imported);
        setSample("empty");
        setEntries([]);
        push({
          kind: "trace",
          status: "done",
          text: `Imported “${imported.title}” · ${imported.nodes.length} nodes`,
        });
      } catch (err) {
        push({
          kind: "trace",
          status: "failed",
          text: `Import failed: ${
            err instanceof Error ? err.message : "invalid file"
          }`,
        });
      }
    },
    [applyDag, push],
  );

  // A source video was chosen (sample / link / upload): bind it to the root
  // resource node(s) so it previews immediately and feeds the run. No trace
  // entry — picking a source clip isn't an agent step.
  const onSourceLoaded = useCallback(
    (s: LoadedSource) => {
      if (source?.url === s.url) return; // already the source → no-op
      setSource(s);
      setNodes((prev) => bindSourceToRoots(prev, edges, s));
    },
    [edges, source],
  );

  // Un-use the source (uncheck a clip): reset the root resource node(s) to their
  // "no video loaded" placeholder.
  const onClearSource = useCallback(() => {
    setSource(null);
    setNodes((prev) => {
      const hasIncoming = new Set(edges.map((e) => e.target));
      return prev.map((n) =>
        n.type === "resource" && !hasIncoming.has(n.id)
          ? {
              ...n,
              data: {
                ...n.data,
                outputUrl: null,
                status: "idle" as NodeStatus,
              },
            }
          : n,
      );
    });
  }, [edges]);

  const generate = useCallback(
    async (promptOverride?: string) => {
    const text = (promptOverride ?? prompt).trim();
    if (!text || loading) return;
    push({ kind: "user", text });
    if (promptOverride === undefined) setPrompt(""); // keep any typed text if a card was clicked
    setLoading(true);
    // Refine the existing pipeline when one has been built (sample was cleared
    // to "empty" by a prior generate/import) — follow-up chat updates it in place.
    const refine = sample === "empty" && nodes.length > 0;
    try {
      const res = await fetch("/api/generate-dag", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-gemini-key": apiKey } : {}),
        },
        body: JSON.stringify({ prompt: text, current: refine ? dag : undefined }),
      });
      const data: GenerateDagResponse = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error);
      applyDag(data.dag);
      setSample("empty"); // generated pipeline is no longer a named sample
      const count = data.dag.nodes.length;
      push({
        kind: "trace",
        status: "done",
        text: `${refine ? "Updated" : "Built"} “${data.dag.title}” · ${count} nodes`,
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
  }, [prompt, loading, push, applyDag, apiKey, sample, nodes, dag]);

  /** Fold a single op's result into its node + downstream resource nodes. */
  const applyOpResult = useCallback(
    (r: OpEvent) => {
      const producedUrl = new Map((r.produced ?? []).map((p) => [p.id, p.url]));
      const downstream = edges
        .filter((e) => e.source === r.id)
        .map((e) => e.target);
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === r.id && n.type === "operation") {
            // Skipped (e.g. no key, or inputs not produced) stays "idle" — it
            // never ran; only a real success is "done" and a hard error "failed".
            // A skip surfaces its reason as an amber note, not a red error.
            const status: NodeStatus = r.skipped
              ? "idle"
              : r.ok
                ? "done"
                : "failed";
            return {
              ...n,
              data: {
                ...n.data,
                status,
                error: !r.ok && !r.skipped ? r.error ?? null : null,
                note: r.skipped ? r.error ?? "skipped" : null,
              },
            };
          }
          if (n.type === "resource" && downstream.includes(n.id)) {
            if (producedUrl.has(n.id))
              return {
                ...n,
                data: {
                  ...n.data,
                  status: "done" as NodeStatus,
                  // Cache-bust per run: the filename is stable across runs, so
                  // without a changing token the preview/editor keep a stale
                  // (or transiently-404'd) copy instead of the fresh file.
                  outputUrl: `${producedUrl.get(n.id)!}?t=${runTokenRef.current}`,
                },
              };
            if (!r.ok && !r.skipped)
              return { ...n, data: { ...n.data, status: "failed" as NodeStatus } };
          }
          return n;
        }),
      );
    },
    [edges],
  );

  const run = useCallback(
    async (fromNode?: string) => {
    if (running || nodes.length === 0) return;
    // A full run needs a source video if the pipeline has a root video resource.
    // Don't run into a confusing all-"done" with no input — pause and point the
    // user at the Sources tab. (A partial re-run reuses on-disk files.)
    if (!fromNode && !source) {
      const needsSource = nodes.some(
        (n) =>
          n.type === "resource" && n.data.isSource && n.data.media === "video",
      );
      if (needsSource) {
        push({
          kind: "assistant",
          text: "Load a source video first — pick a clip in the Sources tab (right panel), or paste a link / upload one.",
        });
        setPreviewNodeId(SOURCES_TAB);
        setSettings((s) =>
          s.resultsLayout === "hidden" ? { ...s, resultsLayout: "bottom" } : s,
        );
        return;
      }
    }
    setRunning(true);
    autoRevealedRef.current = false; // allow one auto-open of the preview per run
    runTokenRef.current += 1; // fresh cache-bust token for this run's artifacts
    // Partial re-run: only the ops downstream of `fromNode` execute (upstream
    // outputs already exist on disk) — so reset just those to queued.
    const willRun = fromNode ? downstreamIds(fromNode, edges) : null;
    setNodes((prev) =>
      prev.map((n) =>
        n.type === "operation" && (!willRun || willRun.has(n.id))
          ? {
              ...n,
              data: {
                ...n.data,
                status: "queued" as NodeStatus,
                error: null,
                note: null,
              },
            }
          : n,
      ),
    );
    const labelOf = new Map(nodes.map((n) => [n.id, n.data.label]));
    const traceByOp = new Map<string, string>();
    let failed = 0;
    let skipped = 0;
    let lastOpId: string | null = null;
    let mode = executionMode;
    try {
      // Send the LIVE nodes (with the loaded source's real filename), not the
      // static sample DAG — so execution reads/writes the actual filenames.
      const liveDag = {
        title: dag.title,
        summary: dag.summary,
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
        edges: edges.map((e) => ({
          source: e.source,
          target: e.target,
          label: e.label,
        })),
      };
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-gemini-key": apiKey } : {}),
        },
        body: JSON.stringify({
          dag: liveDag,
          sourceUrl: source?.url ?? null,
          subtitleStyle: settings.subtitleStyle,
          fromNode: fromNode ?? null,
        }),
      });
      if (!res.body) throw new Error("no response stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "start") {
            mode = ev.mode;
          } else if (ev.type === "op-start") {
            if (settings.followActive) setActiveNodeId(ev.id);
            setNodes((prev) =>
              prev.map((n) =>
                n.id === ev.id && n.type === "operation"
                  ? { ...n, data: { ...n.data, status: "running" as NodeStatus } }
                  : n,
              ),
            );
            const tid = push({
              kind: "trace",
              status: "doing",
              text: `${ev.label}…`,
            });
            traceByOp.set(ev.id, tid);
          } else if (ev.type === "op-done") {
            if (ev.skipped) skipped++;
            else if (!ev.ok) failed++;
            lastOpId = ev.id;
            applyOpResult(ev);
            // When the flow produces a resource that has content, follow it in
            // the preview pane. Reveal the pane at most once per run (latched),
            // so a manual close is never overridden — subsequent produced nodes
            // just advance the selected tab without re-opening it.
            const producedPreview = ev.ok
              ? ev.produced?.find((p) => p.url)
              : undefined;
            if (producedPreview && settings.followActive) {
              setPreviewNodeId(producedPreview.id);
              if (!autoRevealedRef.current) {
                autoRevealedRef.current = true;
                setSettings((s) =>
                  s.resultsLayout === "hidden"
                    ? { ...s, resultsLayout: "bottom" }
                    : s,
                );
              }
            }
            const tid = traceByOp.get(ev.id);
            const status: TraceStatus = ev.ok || ev.skipped ? "done" : "failed";
            const detail = ev.ok
              ? ev.produced?.[0]?.url ?? tailLog(ev.logs)
              : ev.error ?? tailLog(ev.logs);
            const patch = {
              status,
              text: `${labelOf.get(ev.id) ?? ev.id}${ev.skipped ? " (skipped)" : ""}`,
              detail,
            };
            if (tid) update(tid, patch);
            else push({ kind: "trace", ...patch });
          } else if (ev.type === "error") {
            push({ kind: "trace", status: "failed", text: `Error: ${ev.error}` });
          }
        }
      }
      const engine = mode === "replit" ? "Replit Cloud" : "local FFmpeg";
      push({
        kind: "assistant",
        text: failed
          ? `Ran on ${engine} — ${failed} step(s) failed. See node details.`
          : skipped
            ? `Ran on ${engine} — ${skipped} step(s) skipped (add a Gemini API key for transcription).`
            : `Ran on ${engine} — all steps done.`,
      });
      // Leave the viewport on the last touched stage (readable) rather than
      // shrinking back to the whole pipeline.
      if (settings.followActive)
        setActiveNodeId(lastFocusId(lastOpId, edges) ?? null);
    } catch (err) {
      push({
        kind: "trace",
        status: "failed",
        text: `Execution failed: ${err instanceof Error ? err.message : "unknown"}`,
      });
      setActiveNodeId(null);
    } finally {
      setRunning(false);
    }
  }, [
    running,
    nodes,
    dag,
    source,
    edges,
    executionMode,
    push,
    update,
    applyOpResult,
    settings.followActive,
    settings.subtitleStyle,
    apiKey,
  ]);

  // Every resource node is previewable as a tab; the artifact URL may be absent
  // (blank tab) until the pipeline produces it.
  const previewItems = useMemo<PreviewItem[]>(() => {
    const items: PreviewItem[] = [];
    for (const n of nodes) {
      if (n.type === "resource") {
        items.push({
          id: n.id,
          label: n.data.label,
          media: n.data.media,
          url: n.data.outputUrl ?? null,
        });
      }
    }
    return items;
  }, [nodes]);

  // Open a resource's tab; reveal the results pane (docked bottom) if hidden.
  const onPreview = useCallback((id: string) => {
    setPreviewNodeId(id);
    setSettings((s) =>
      s.resultsLayout === "hidden" ? { ...s, resultsLayout: "bottom" } : s,
    );
  }, []);

  const layout = settings.resultsLayout;
  const showResults = layout !== "hidden";

  const resultsPanel = (
    <ResultsPanel
      items={previewItems}
      activeId={previewNodeId}
      onSelect={setPreviewNodeId}
      onClose={() => onSettingsChange({ resultsLayout: "hidden" })}
      layout={layout}
      onLayoutChange={(l) => onSettingsChange({ resultsLayout: l })}
      source={source}
      onSourceLoaded={onSourceLoaded}
      onClearSource={onClearSource}
      maxUploadMb={maxUploadMb}
      onReburn={(nodeId) => run(nodeId)}
      running={running}
    />
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
        apiKey={apiKey}
        onApiKeySet={onApiKeySet}
        hasServerKey={hasServerKey}
        onRun={() => run()}
        running={running}
        canRun={nodes.length > 0}
      />

      <div className="flex min-h-0 flex-1">
        <div style={{ width: sidePanel.size }} className="min-h-0 shrink-0">
          <SidePanel
            prompt={prompt}
            onPromptChange={setPrompt}
            onGenerate={generate}
            onNewChat={onNewChat}
            loading={loading}
            running={running}
            entries={entries}
            source={source}
            onSourceLoaded={onSourceLoaded}
            maxUploadMb={maxUploadMb}
            showSourceLoader={settings.showSourceLoader}
          />
        </div>

        <Divider axis="x" onPointerDown={sidePanel.onPointerDown} />

        {/* Canvas + results split (results dock: top / right / bottom) */}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1",
            layout === "right" ? "flex-row" : "flex-col",
          )}
        >
          {showResults && layout === "top" && (
            <>
              <div
                style={{ height: resultsPane.size }}
                className="min-h-0 min-w-0 shrink-0"
              >
                {resultsPanel}
              </div>
              <Divider axis="y" onPointerDown={resultsPane.onPointerDown} />
            </>
          )}

          <main className="relative min-h-0 min-w-0 flex-1">
            <PipelineCanvas
              nodes={nodes}
              edges={edges}
              animateEdges={settings.animateEdges}
              refitKey={refitKey}
              onPreview={onPreview}
              activeNodeId={activeNodeId}
            />

            <CanvasExportToolbar
              title={dag.title}
              summary={dag.summary}
              nodes={nodes}
              edges={edges}
              onImportFile={importFile}
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

          {showResults && layout !== "top" && (
            <>
              <Divider
                axis={layout === "right" ? "x" : "y"}
                onPointerDown={resultsPane.onPointerDown}
              />
              <div
                style={
                  layout === "right"
                    ? { width: resultsPane.size }
                    : { height: resultsPane.size }
                }
                className="min-h-0 min-w-0 shrink-0"
              >
                {resultsPanel}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** All node ids reachable downstream of `fromId` (its consumers, transitively). */
function downstreamIds(fromId: string, edges: PipelineEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
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

/** Thin draggable divider between panes. */
function Divider({
  axis,
  onPointerDown,
}: {
  axis: "x" | "y";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "shrink-0 bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-800 dark:hover:bg-indigo-500",
        axis === "x" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    />
  );
}

/**
 * Point the pipeline's root resource node(s) — those with no incoming edge — at
 * a freshly loaded source video so it previews immediately and feeds the run.
 */
function bindSourceToRoots(
  nodes: PipelineFlowNode[],
  edges: PipelineEdge[],
  source: LoadedSource,
): PipelineFlowNode[] {
  const hasIncoming = new Set(edges.map((e) => e.target));
  // The on-disk filename is the URL basename (samples expose a display label as
  // `name`, so we can't use that); this is what execution copies + reads.
  const filename = decodeURIComponent(
    source.url.split("/").pop() || source.name,
  );
  return nodes.map((n) =>
    n.type === "resource" && !hasIncoming.has(n.id)
      ? {
          ...n,
          data: {
            ...n.data,
            filename,
            outputUrl: source.url,
            status: "done" as NodeStatus,
          },
        }
      : n,
  );
}
