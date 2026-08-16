import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, Eye, Loader2, Play } from "lucide-react";
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
import { hasExtraDetails } from "./nodeInspect";
import { usePipelineNodeCallbacks } from "./PipelineNodeContext";

const handleCls =
  "!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white dark:!bg-slate-900 transition-colors";

/** Eye button shown in a node header only when there's more to reveal. */
function DetailsButton({ id, data }: { id: string; data: PipelineNodeData }) {
  const { onShowDetails } = usePipelineNodeCallbacks();
  if (!onShowDetails || !hasExtraDetails(data)) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onShowDetails(id);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title="View details (or double-click)"
      aria-label="View node details"
      className="nodrag inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
    >
      <Eye className="h-3 w-3" />
    </button>
  );
}

/* ── Resource (media artifact) node ──────────────────────────────────────── */

export type ResourceRFNode = Node<ResourceNodeData, "resource">;

function ResourceNodeImpl({ id, data, selected }: NodeProps<ResourceRFNode>) {
  const style = STATUS_STYLES[data.status];
  const Icon = MEDIA_ICONS[data.media] ?? MEDIA_ICONS.video;
  return (
    <div
      className={cn(
        "relative min-w-[180px] max-w-[240px] rounded-xl border-2 p-3 shadow-lg backdrop-blur-sm transition-all",
        style.body,
        style.pulse && "status-pulse",
        selected &&
          "ring-2 ring-offset-2 ring-indigo-500 ring-offset-white dark:ring-offset-slate-950",
      )}
      style={
        {
          borderColor: style.color,
          "--status-glow": style.glow,
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <Handle type="source" position={Position.Right} className={handleCls} />
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: style.color }}
        >
          <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {data.label}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <StatusBadge status={data.status} />
              <DetailsButton id={id} data={data} />
            </div>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
            {data.filename}
          </div>
          {data.description && (
            <div className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
              {data.description}
            </div>
          )}
          {data.outputUrl && (
            <a
              href={data.outputUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              <Play className="h-3 w-3" /> Preview output
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Operation (ADK agent) node ──────────────────────────────────────────── */

export type OperationRFNode = Node<OperationNodeData, "operation">;

function OperationNodeImpl({ id, data, selected }: NodeProps<OperationRFNode>) {
  const style = STATUS_STYLES[data.status];
  const Icon = ENGINE_ICONS[data.engine] ?? ENGINE_ICONS.ffmpeg;
  const accent = ENGINE_COLORS[data.engine] ?? style.color;
  return (
    <div
      className={cn(
        // Diamond-ish "operation" chip: rounded, dashed accent to read as a
        // step (verb) rather than an artifact (noun).
        "relative min-w-[190px] max-w-[260px] rounded-lg border-2 border-dashed p-3 shadow-lg backdrop-blur-sm transition-all",
        style.body,
        style.pulse && "status-pulse",
        selected &&
          "ring-2 ring-offset-2 ring-indigo-500 ring-offset-white dark:ring-offset-slate-950",
      )}
      style={
        {
          borderColor: data.status === "idle" ? accent : style.color,
          "--status-glow": style.glow,
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <Handle type="source" position={Position.Right} className={handleCls} />
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: accent }}
        >
          <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {data.label}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <StatusBadge status={data.status} />
              <DetailsButton id={id} data={data} />
            </div>
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span
              className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: accent }}
            >
              {data.engine}
            </span>
          </div>
          {data.agent && (
            <div className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
              {data.agent}
            </div>
          )}
          {data.command && (
            <div className="mt-2 line-clamp-2 rounded bg-slate-500/10 px-1.5 py-1 font-mono text-[10px] text-slate-600 dark:text-slate-300">
              {data.command}
            </div>
          )}
          {data.error && (
            <div className="mt-2 flex items-start gap-1 rounded bg-red-500/10 px-1.5 py-1 text-[11px] text-red-600 dark:text-red-300">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span className="line-clamp-2 min-w-0 break-words">
                {data.error}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ResourceNodeData["status"] }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      style={{ color: style.color, backgroundColor: `${style.color}22` }}
    >
      {status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {style.label}
    </span>
  );
}

export const ResourceNode = memo(ResourceNodeImpl);
export const OperationNode = memo(OperationNodeImpl);

/** Node type registry passed to React Flow. */
export const nodeTypes = {
  resource: ResourceNode,
  operation: OperationNode,
};
