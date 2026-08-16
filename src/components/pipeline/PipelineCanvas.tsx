"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import type { PipelineEdge, PipelineFlowNode } from "@/lib/types";
import { useTheme } from "@/components/theme/ThemeProvider";
import { STATUS_STYLES } from "./nodeStyles";
import { nodeTypes } from "./VideoNode";
import { STATUS_ORDER } from "@/lib/dag";
import { PipelineNodeContext } from "./PipelineNodeContext";
import { NodeDetailsDrawer } from "./NodeDetailsDrawer";
import { RoutedEdge } from "./RoutedEdge";

const edgeTypes = { routed: RoutedEdge };

interface Props {
  nodes: PipelineFlowNode[];
  edges: PipelineEdge[];
  /** Animate media flowing along edges leaving running/done nodes. */
  animateEdges?: boolean;
  /** Changing this value refits the view (used for "auto-fit on generate"). */
  refitKey?: number;
}

/** Read-only React Flow canvas rendering the generated video pipeline. */
export function PipelineCanvas({
  nodes,
  edges,
  animateEdges = true,
  refitKey = 0,
}: Props) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  // Keep an internal, draggable copy of the nodes; re-sync whenever the parent
  // pushes a new pipeline or status update.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(
    nodes as unknown as Node[],
  );
  useEffect(() => {
    setRfNodes(nodes as unknown as Node[]);
  }, [nodes, setRfNodes]);

  // Node-details inspector, opened from a node's eye button (or double-click).
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const onShowDetails = useCallback((id: string) => setDetailsId(id), []);
  const detailsData = useMemo(
    () => nodes.find((n) => n.id === detailsId)?.data ?? null,
    [nodes, detailsId],
  );
  // Drop the inspector if its node disappears (e.g. switching samples).
  useEffect(() => {
    if (detailsId && !nodes.some((n) => n.id === detailsId)) setDetailsId(null);
  }, [nodes, detailsId]);

  // Color each edge by the status of its source node so media "lights up" as it
  // flows, and animate edges leaving a running/done node. Simple edges render as
  // plain beziers; skip-edges follow dagre waypoints (see RoutedEdge) so they
  // arc around intermediate nodes instead of being clipped by their borders.
  const rfEdges: Edge[] = useMemo(() => {
    const statusOf = new Map(nodes.map((n) => [n.id, n.data.status]));
    return edges.map((e) => {
      const s = statusOf.get(e.source) ?? "idle";
      const color = STATUS_STYLES[s].color;
      const flowing = animateEdges && (s === "running" || s === "done");
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "routed",
        data: { routed: e.routed, points: e.points, flowing },
        style: { stroke: color, strokeWidth: 2 },
      };
    });
  }, [edges, nodes, animateEdges]);

  const isEmpty = nodes.length === 0;

  return (
    <PipelineNodeContext.Provider value={{ onShowDetails }}>
    <div className="relative h-full w-full">
      <ReactFlow
        key={refitKey}
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={(_, n) => setDetailsId(n.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: false }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color={dark ? "#1e293b" : "#e2e8f0"}
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="!bg-slate-100 dark:!bg-slate-900"
          nodeColor={(n) =>
            STATUS_STYLES[
              (n.data as { status?: keyof typeof STATUS_STYLES })?.status ??
                "idle"
            ].color
          }
          maskColor={dark ? "rgba(2,6,23,0.6)" : "rgba(241,245,249,0.6)"}
        />
      </ReactFlow>

      {isEmpty && <EmptyState />}
      {!isEmpty && <Legend />}
      {detailsData && (
        <NodeDetailsDrawer
          data={detailsData}
          onClose={() => setDetailsId(null)}
        />
      )}
    </div>
    </PipelineNodeContext.Provider>
  );
}

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow">
          <Clapperboard className="h-6 w-6" />
        </div>
        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Empty canvas
        </div>
        <p className="text-xs text-slate-400">
          Describe a video workflow in the panel on the left, or pick a sample
          pipeline from Settings.
        </p>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-lg border border-slate-200 bg-white/90 p-2.5 text-[11px] shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <div className="mb-1.5 font-semibold text-slate-500 dark:text-slate-400">
        Node status
      </div>
      <div className="grid grid-cols-1 gap-1">
        {STATUS_ORDER.map((s) => {
          const style = STATUS_STYLES[s];
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: style.color }}
              />
              <span className="text-slate-600 dark:text-slate-300">
                {style.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
