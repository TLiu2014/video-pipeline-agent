"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { PROMPT_TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { SourceLoader } from "./SourceLoader";
import type { LoadedSource } from "@/lib/types";

export type TraceKind = "user" | "assistant" | "trace";
export type TraceStatus = "doing" | "done" | "failed";

export interface TraceEntry {
  id: string;
  kind: TraceKind;
  text: string;
  /** Only for kind === "trace": drives the leading glyph + color. */
  status?: TraceStatus;
  /** Optional secondary line (e.g. a short result summary). */
  detail?: string;
}

interface SidePanelProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  onGenerate: () => void;
  onRun: () => void;
  onReset: () => void;
  loading: boolean;
  running: boolean;
  entries: TraceEntry[];
  executionMode: string;
  /** Whether the canvas currently has a runnable pipeline. */
  canRun: boolean;
  source: LoadedSource | null;
  onSourceLoaded: (s: LoadedSource) => void;
  maxUploadMb: number;
  /** Show the source-loader controls (toggle in settings). */
  showSourceLoader: boolean;
}

/**
 * Left workspace panel (pattern from Q-Pilot's ChatPanel / AtlasOrbit's
 * AgentChatPanel): a run control, a live trace of agent steps + chat turns, and
 * a prompt composer at the bottom.
 */
export function SidePanel({
  prompt,
  onPromptChange,
  onGenerate,
  onRun,
  onReset,
  loading,
  running,
  entries,
  executionMode,
  canRun,
  source,
  onSourceLoaded,
  maxUploadMb,
  showSourceLoader,
}: SidePanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, loading, running]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (loading || !prompt.trim()) return;
    onGenerate();
  };

  const busy = loading || running;

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Panel header */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Pipeline Agent
          </span>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            title="Clear the trace"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
        )}
      </header>

      {/* Source loader (toggle in settings) */}
      {showSourceLoader && (
        <div className="shrink-0 border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Source video
          </div>
          <SourceLoader
            current={source}
            onLoaded={onSourceLoaded}
            maxMb={maxUploadMb}
          />
        </div>
      )}

      {/* Run control */}
      <div className="shrink-0 border-b border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={onRun}
          disabled={busy || !canRun}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? "Running…" : "Run Pipeline"}
        </button>
        <div className="mt-1.5 text-center text-[11px] text-slate-400">
          Executes on{" "}
          <span className="font-medium text-slate-500 dark:text-slate-300">
            {executionMode === "replit" ? "Replit Cloud" : "Local FFmpeg"}
          </span>
        </div>
      </div>

      {/* Trace / chat timeline */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {entries.length === 0 ? (
          <EmptyChips
            onPick={(p) => {
              onPromptChange(p);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
            {loading && <ThinkingPill label="Planning pipeline…" />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={submit}
        className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800"
      >
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Describe your video workflow…"
            disabled={loading}
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            title="Build pipeline from prompt"
            aria-label="Build pipeline"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </aside>
  );
}

function EmptyChips({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-400">
        Try one of these, or describe your own workflow below:
      </p>
      {PROMPT_TEMPLATES.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onPick(t.prompt)}
          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"
        >
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t.label}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
            {t.prompt}
          </div>
        </button>
      ))}
    </div>
  );
}

function Entry({ entry }: { entry: TraceEntry }) {
  if (entry.kind === "user") {
    return (
      <div className="self-end max-w-[85%] rounded-lg rounded-br-sm bg-indigo-500 px-3 py-1.5 text-sm text-white">
        {entry.text}
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className="self-start max-w-[90%] rounded-lg rounded-bl-sm bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {entry.text}
      </div>
    );
  }
  // trace row
  const status = entry.status ?? "done";
  return (
    <div
      className={cn(
        "self-start max-w-full rounded-md border px-2.5 py-1.5 text-xs",
        status === "done" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
        status === "doing" &&
          "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        status === "failed" &&
          "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
      )}
    >
      <div className="flex items-center gap-1.5">
        {status === "doing" && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        )}
        {status === "done" && <Check className="h-3 w-3 shrink-0" />}
        {status === "failed" && <X className="h-3 w-3 shrink-0" />}
        <span className="min-w-0 break-words">{entry.text}</span>
      </div>
      {entry.detail && (
        <div className="mt-1 whitespace-pre-wrap break-words pl-[18px] font-mono text-[10px] opacity-80">
          {entry.detail}
        </div>
      )}
    </div>
  );
}

function ThinkingPill({ label }: { label: string }) {
  return (
    <div className="self-start inline-flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
