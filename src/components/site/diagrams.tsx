"use client";

import {
  ArrowDown,
  ArrowRight,
  Cpu,
  Film,
  Server,
  Sparkles,
  Wand2,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free architecture diagrams for the docs/landing — styled boxes +
 * arrow icons (no Mermaid runtime), theme-aware. Tinted fills + visible borders
 * so the boxes read clearly on the dark background too.
 */

type Tone = "slate" | "indigo" | "violet" | "sky" | "emerald";

const TONE: Record<Tone, string> = {
  slate:
    "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800",
  indigo:
    "border-indigo-200 bg-indigo-50 dark:border-indigo-400/50 dark:bg-indigo-500/15",
  violet:
    "border-violet-200 bg-violet-50 dark:border-violet-400/50 dark:bg-violet-500/15",
  sky: "border-sky-200 bg-sky-50 dark:border-sky-400/50 dark:bg-sky-500/15",
  emerald:
    "border-emerald-200 bg-emerald-50 dark:border-emerald-400/50 dark:bg-emerald-500/15",
};

function Box({
  title,
  sub,
  icon,
  tone = "slate",
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-lg border px-3 py-2.5 text-center",
        TONE[tone],
        className,
      )}
    >
      <div className="flex items-center justify-center gap-1.5">
        {icon && (
          <span className="shrink-0 text-slate-500 dark:text-slate-300">
            {icon}
          </span>
        )}
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </span>
      </div>
      {sub && (
        <span className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {sub}
        </span>
      )}
    </div>
  );
}

const Down = () => (
  <div className="flex justify-center py-1.5 text-slate-400 dark:text-slate-500">
    <ArrowDown className="h-4 w-4" />
  </div>
);
const Right = () => (
  <ArrowRight className="h-4 w-4 shrink-0 self-center text-slate-400 dark:text-slate-500" />
);

const ICON = "h-3.5 w-3.5";

/** Overall system architecture: prompt → build → run → preview. */
export function ArchitectureDiagram() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:p-6">
      <div className="mx-auto max-w-xl">
        <Box
          tone="indigo"
          icon={<Wand2 className={ICON} />}
          title="Natural-language prompt"
          sub={'e.g. “subtitle this in English + Chinese”'}
        />
        <Down />
        <Box
          tone="violet"
          icon={<Sparkles className={ICON} />}
          title="ADK builder agent · Gemini"
          sub="parses intent → a Resource/Operation DAG (JSON)"
        />
        <Down />
        <Box
          tone="sky"
          icon={<Workflow className={ICON} />}
          title="Pipeline DAG on the canvas"
          sub="React Flow · alternating resource ↔ operation nodes"
        />
        <Down />
        <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            ExecutorService · EXECUTION_MODE
          </div>
          <div className="flex items-stretch gap-2">
            <Box
              tone="slate"
              icon={<Cpu className={ICON} />}
              title="Local FFmpeg"
              sub="child_process on this machine"
            />
            <Box
              tone="slate"
              icon={<Server className={ICON} />}
              title="Replit executor"
              sub="FFmpeg offloaded over HTTP"
            />
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-violet-100 px-2 py-1 text-[11px] text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <Sparkles className="h-3 w-3" />
            Gemini runs locally for transcription / translation / smart reframe
          </div>
        </div>
        <Down />
        <Box
          tone="emerald"
          icon={<Film className={ICON} />}
          title="Rendered artifacts"
          sub="subtitled video · vertical short · .srt subtitles"
        />
        <Down />
        <Box
          tone="slate"
          title="Results preview"
          sub="in-app video player + editable subtitle view"
        />
      </div>
    </div>
  );
}

/** The general, strictly-alternating resource ↔ operation pipeline shape. */
export function PipelineDiagram() {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:p-6">
      <div className="flex min-w-[560px] items-stretch gap-2">
        <Box
          tone="sky"
          icon={<Film className={ICON} />}
          title="Source"
          sub="resource · media file"
        />
        <Right />
        <Box
          tone="indigo"
          icon={<Cpu className={ICON} />}
          title="Operation"
          sub="agent · tool"
        />
        <Right />
        <Box
          tone="sky"
          icon={<Film className={ICON} />}
          title="Resource"
          sub="intermediate media"
        />
        <Right />
        <Box
          tone="indigo"
          icon={<Cpu className={ICON} />}
          title="Operation"
          sub="agent · tool"
        />
        <Right />
        <Box
          tone="emerald"
          icon={<Film className={ICON} />}
          title="Output"
          sub="resource · final media"
        />
      </div>
    </div>
  );
}
