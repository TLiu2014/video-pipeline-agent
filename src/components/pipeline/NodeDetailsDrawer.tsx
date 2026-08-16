"use client";

import { useEffect } from "react";
import { X, Play } from "lucide-react";
import type {
  OperationNodeData,
  PipelineNodeData,
  ResourceNodeData,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ENGINE_COLORS,
  ENGINE_ICONS,
  MEDIA_ICONS,
  STATUS_STYLES,
} from "./nodeStyles";

/**
 * Read-only inspector for a pipeline node, revealed by the node's eye button.
 * Floats over the top-right of the canvas; dismiss with X or Escape.
 */
export function NodeDetailsDrawer({
  data,
  onClose,
}: {
  data: PipelineNodeData;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const style = STATUS_STYLES[data.status];
  const isResource = data.nodeClass === "resource";
  const Icon = isResource
    ? MEDIA_ICONS[(data as ResourceNodeData).media] ?? MEDIA_ICONS.video
    : ENGINE_ICONS[(data as OperationNodeData).engine] ?? ENGINE_ICONS.ffmpeg;
  const accent = isResource
    ? style.color
    : ENGINE_COLORS[(data as OperationNodeData).engine] ?? style.color;

  return (
    <div className="absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-80 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: accent }}
          >
            <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {data.label}
            </div>
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: style.color }}
            >
              {isResource ? "Resource" : "Operation"} · {style.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 space-y-3 overflow-y-auto p-4">
        {isResource ? (
          <ResourceBody data={data as ResourceNodeData} />
        ) : (
          <OperationBody data={data as OperationNodeData} accent={accent} />
        )}
      </div>
    </div>
  );
}

function ResourceBody({ data }: { data: ResourceNodeData }) {
  return (
    <>
      <Field label="Media type" value={data.media} mono />
      <Field label="Filename" value={data.filename} mono />
      {data.description && <Field label="Description" value={data.description} />}
      {data.outputUrl && (
        <a
          href={data.outputUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
        >
          <Play className="h-3.5 w-3.5" /> Preview output
        </a>
      )}
    </>
  );
}

function OperationBody({
  data,
  accent,
}: {
  data: OperationNodeData;
  accent: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Engine
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: accent }}
        >
          {data.engine}
        </span>
      </div>
      {data.agent && <Field label="Agent" value={data.agent} />}
      {data.description && <Field label="Details" value={data.description} />}
      {data.command && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Command
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-2.5 font-mono text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {data.command}
          </pre>
        </div>
      )}
      {data.error && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-500">
            Error
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-red-500/10 p-2.5 font-mono text-[11px] text-red-600 dark:text-red-300">
            {data.error}
          </pre>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div
        className={cn(
          "break-words text-sm text-slate-700 dark:text-slate-200",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}
