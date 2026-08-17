import { memo } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { AlertTriangle, Eye, Loader2, Play, X } from "lucide-react";
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

/** Eye toggle shown only when there's more to reveal than the card shows. */
function EyeButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title="Details (or double-click)"
      aria-label="Toggle node details"
      className={cn(
        "nodrag inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
        open
          ? "bg-indigo-500 text-white"
          : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700/60 dark:hover:text-slate-100",
      )}
    >
      <Eye className="h-3 w-3" />
    </button>
  );
}

/** Details popover anchored to the right of the node (moves with pan/zoom). */
function NodeDetailsPopover({
  id,
  data,
  open,
  onClose,
}: {
  id: string;
  data: PipelineNodeData;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <NodeToolbar
      nodeId={id}
      isVisible={open}
      position={Position.Right}
      offset={12}
      className="!pointer-events-auto"
    >
      <div className="w-64 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {data.nodeClass === "resource" ? "Resource" : "Operation"} details
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {data.nodeClass === "resource" ? (
          <ResourceDetails data={data as ResourceNodeData} />
        ) : (
          <OperationDetails data={data as OperationNodeData} />
        )}
      </div>
    </NodeToolbar>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div
        className={cn(
          "break-words text-xs text-slate-700 dark:text-slate-200",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ResourceDetails({ data }: { data: ResourceNodeData }) {
  return (
    <>
      <Field label="Media" value={data.media} />
      <Field label="Filename" value={data.filename} mono />
      {data.description && <Field label="Description" value={data.description} />}
    </>
  );
}

function OperationDetails({ data }: { data: OperationNodeData }) {
  return (
    <>
      <Field label="Engine" value={data.engine} />
      {data.agent && <Field label="Agent" value={data.agent} />}
      {data.description && <Field label="Details" value={data.description} />}
      {data.command && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Command
          </div>
          <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-100 p-2 font-mono text-[10px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {data.command}
          </pre>
        </div>
      )}
      {data.error && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500">
            Error
          </div>
          <pre className="mt-0.5 whitespace-pre-wrap break-words rounded bg-red-500/10 p-2 font-mono text-[10px] text-red-600 dark:text-red-300">
            {data.error}
          </pre>
        </div>
      )}
      {!data.error && data.note && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
            Skipped
          </div>
          <pre className="mt-0.5 whitespace-pre-wrap break-words rounded bg-amber-500/10 p-2 font-mono text-[10px] text-amber-600 dark:text-amber-300">
            {data.note}
          </pre>
        </div>
      )}
    </>
  );
}

const nodeShellRing =
  "ring-2 ring-offset-2 ring-indigo-500 ring-offset-white dark:ring-offset-slate-950";

/* ── Resource (media artifact) node ──────────────────────────────────────── */

export type ResourceRFNode = Node<ResourceNodeData, "resource">;

function ResourceNodeImpl({ id, data, selected }: NodeProps<ResourceRFNode>) {
  const style = STATUS_STYLES[data.status];
  const Icon = MEDIA_ICONS[data.media] ?? MEDIA_ICONS.video;
  const { onPreview, detailsId, onToggleDetails } = usePipelineNodeCallbacks();
  const details = hasExtraDetails(data);
  const open = detailsId === id;
  const needsSource = data.isSource && !data.outputUrl;

  return (
    <div
      onDoubleClick={(e) => {
        if (details) {
          e.stopPropagation();
          onToggleDetails?.(id);
        }
      }}
      className={cn(
        "relative min-w-[180px] max-w-[240px] rounded-xl border-2 p-3 shadow-lg backdrop-blur-sm transition-all",
        style.body,
        style.pulse && "status-pulse",
        selected && nodeShellRing,
      )}
      style={
        { borderColor: style.color, "--status-glow": style.glow } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <Handle type="source" position={Position.Right} className={handleCls} />
      <NodeDetailsPopover
        id={id}
        data={data}
        open={open}
        onClose={() => onToggleDetails?.(id)}
      />
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
              {details && (
                <EyeButton open={open} onToggle={() => onToggleDetails?.(id)} />
              )}
            </div>
          </div>
          {needsSource ? (
            <div className="mt-0.5 truncate text-[11px] italic text-slate-400">
              no video loaded — pick a source →
            </div>
          ) : (
            <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
              {data.filename}
            </div>
          )}
          {data.description && (
            <div className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
              {data.description}
            </div>
          )}
          {onPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPreview(id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "nodrag mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                data.outputUrl
                  ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 dark:text-slate-400",
              )}
            >
              <Play className="h-3 w-3" />{" "}
              {data.media === "subtitle" || data.media === "text"
                ? "View / edit"
                : "Preview"}
            </button>
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
  const { detailsId, onToggleDetails } = usePipelineNodeCallbacks();
  const details = hasExtraDetails(data);
  const open = detailsId === id;

  return (
    <div
      onDoubleClick={(e) => {
        if (details) {
          e.stopPropagation();
          onToggleDetails?.(id);
        }
      }}
      className={cn(
        "relative min-w-[190px] max-w-[260px] rounded-lg border-2 border-dashed p-3 shadow-lg backdrop-blur-sm transition-all",
        style.body,
        style.pulse && "status-pulse",
        selected && nodeShellRing,
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
      <NodeDetailsPopover
        id={id}
        data={data}
        open={open}
        onClose={() => onToggleDetails?.(id)}
      />
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
              {details && (
                <EyeButton open={open} onToggle={() => onToggleDetails?.(id)} />
              )}
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
          {!data.error && data.note && (
            <div className="mt-2 flex items-start gap-1 rounded bg-amber-500/10 px-1.5 py-1 text-[11px] text-amber-600 dark:text-amber-300">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span className="line-clamp-2 min-w-0 break-words">
                {data.note}
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
