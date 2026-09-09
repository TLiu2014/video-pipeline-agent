"use client";

import Link from "next/link";
import { Loader2, Play } from "lucide-react";
import { CineDagTile } from "@/components/brand/CineDagMark";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SettingsMenu, type AppSettings } from "./SettingsMenu";
import type { SampleId } from "@/lib/dag";

interface HeaderProps {
  settings: AppSettings;
  onSettingsChange: (next: Partial<AppSettings>) => void;
  sample: SampleId;
  onSampleChange: (id: SampleId) => void;
  executionMode: string;
  model: string;
  apiKey: string | null;
  onApiKeySet: (key: string) => void;
  hasServerKey: boolean;
  onRun: () => void;
  running: boolean;
  canRun: boolean;
}

/** Slim top bar: brand on the left, settings + theme on the right. The prompt
 *  input now lives in the left side panel. */
export function Header({
  settings,
  onSettingsChange,
  sample,
  onSampleChange,
  executionMode,
  model,
  apiKey,
  onApiKeySet,
  hasServerKey,
  onRun,
  running,
  canRun,
}: HeaderProps) {
  const engineLabel = executionMode === "replit" ? "Replit Cloud" : "Local FFmpeg";
  return (
    <header className="z-20 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      {/* Brand — links back to the landing page (matches the docs header). */}
      <Link
        href="/"
        aria-label="CineDAG home"
        className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-80"
      >
        <CineDagTile size={34} />
        <div className="text-base font-semibold leading-none text-slate-900 dark:text-slate-100">
          Cine<span className="text-indigo-500">DAG</span>
        </div>
      </Link>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={running || !canRun}
          title={`Run pipeline on ${engineLabel}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? "Running…" : "Run"}
        </button>
        {/* Execution-engine label next to Run (hidden for now, kept for later):
        <span className="mr-1 hidden text-[11px] text-slate-400 sm:inline">
          on{" "}
          <span className="font-medium text-slate-500 dark:text-slate-300">
            {engineLabel}
          </span>
        </span>
        */}
        <ThemeToggle />
        <SettingsMenu
          settings={settings}
          onChange={onSettingsChange}
          sample={sample}
          onSampleChange={onSampleChange}
          executionMode={executionMode}
          model={model}
          apiKey={apiKey}
          onApiKeySet={onApiKeySet}
          hasServerKey={hasServerKey}
        />
      </div>
    </header>
  );
}
