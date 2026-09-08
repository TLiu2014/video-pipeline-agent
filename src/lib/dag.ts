import dagre from "@dagrejs/dagre";
import subtitleSample from "../../sample/subtitle.json";
import reframeSample from "../../sample/reframe.json";
import verticalSample from "../../sample/vertical.json";
import type {
  GeneratedDag,
  MediaKind,
  NodeStatus,
  OperationEngine,
  OperationNodeData,
  PipelineEdge,
  PipelineFlowNode,
  ResourceNodeData,
} from "./types";

// Approximate rendered node footprints, fed to dagre so it reserves space (and
// routing lanes for skip-edges) instead of stacking nodes on top of edges.
const NODE_SIZE: Record<"resource" | "operation", { w: number; h: number }> = {
  resource: { w: 240, h: 118 },
  operation: { w: 268, h: 166 },
};

/**
 * Left-to-right layered layout via dagre. dagre ranks nodes by dependency depth
 * (keeping the flow strictly L→R) and — crucially — inserts virtual routing
 * lanes for edges that span multiple ranks, so a long skip-edge gets its own
 * corridor rather than being drawn underneath the intermediate nodes. The ADK
 * builder therefore never has to emit coordinates.
 */
interface LayoutResult {
  /** Top-left position per node id. */
  pos: Record<string, { x: number; y: number }>;
  /** Center point per node id (flow coords). */
  center: Record<string, { x: number; y: number }>;
  /** dagre-routed waypoints per `${source}->${target}` edge (flow coords). */
  edgePoints: Record<string, Array<{ x: number; y: number }>>;
}

function computePositions(
  nodes: Array<{ id: string; type: "resource" | "operation" }>,
  edges: Array<{ source: string; target: string }>,
): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR", // left → right
    ranksep: 100, // gap between stages
    nodesep: 60, // gap between siblings in a stage
    edgesep: 30, // gap between parallel edges (skip-edge lanes)
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const size = NODE_SIZE[n.type];
    g.setNode(n.id, { width: size.w, height: size.h });
  }
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  // dagre reports node centers; React Flow positions are top-left corners.
  const pos: Record<string, { x: number; y: number }> = {};
  const center: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const node = g.node(n.id);
    if (!node) {
      pos[n.id] = { x: 0, y: 0 };
      center[n.id] = { x: 0, y: 0 };
      continue;
    }
    pos[n.id] = { x: node.x - node.width / 2, y: node.y - node.height / 2 };
    center[n.id] = { x: node.x, y: node.y };
  }

  const edgePoints: Record<string, Array<{ x: number; y: number }>> = {};
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const routed = g.edge(e.source, e.target);
    if (routed?.points)
      edgePoints[`${e.source}->${e.target}`] = routed.points.map(
        (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
      );
  }

  return { pos, center, edgePoints };
}

/**
 * Turn a raw ADK-generated DAG into positioned React Flow nodes + edges, all
 * seeded to the `idle` status. Defensive about missing/loose fields since the
 * shape ultimately comes from an LLM.
 */
export function hydrateDag(dag: GeneratedDag): {
  nodes: PipelineFlowNode[];
  edges: PipelineEdge[];
} {
  const { pos, center, edgePoints } = computePositions(
    dag.nodes.map((n) => ({ id: n.id, type: n.type })),
    dag.edges,
  );
  // Root resources (no incoming edge) are the pipeline's source video input.
  const hasIncoming = new Set(dag.edges.map((e) => e.target));

  const nodes: PipelineFlowNode[] = dag.nodes.map((n) => {
    const position = pos[n.id] ?? { x: 0, y: 0 };
    const d = n.data ?? {};
    if (n.type === "resource") {
      const data: ResourceNodeData = {
        nodeClass: "resource",
        label: String(d.label ?? "media"),
        media: (d.media as MediaKind) ?? "video",
        filename: String(d.filename ?? "output"),
        description: d.description ? String(d.description) : undefined,
        status: "idle",
        outputUrl: null,
        isSource: !hasIncoming.has(n.id),
      };
      return { id: n.id, type: "resource", position, data };
    }
    const data: OperationNodeData = {
      nodeClass: "operation",
      label: String(d.label ?? "Operation"),
      agent: String(d.agent ?? d.label ?? "Agent"),
      engine: (d.engine as OperationEngine) ?? "ffmpeg",
      command: d.command ? String(d.command) : undefined,
      description: d.description ? String(d.description) : undefined,
      status: "idle",
      error: null,
    };
    return { id: n.id, type: "operation", position, data };
  });

  // An edge is a "skip-edge" if any other node's center-x falls strictly
  // between its endpoints — i.e. it visually spans over an intermediate node
  // and would clip it if drawn as a straight bezier. Those get dagre's routed
  // waypoints; simple adjacent edges stay as plain beziers.
  const edges: PipelineEdge[] = dag.edges.map((e, i) => {
    const sc = center[e.source];
    const tc = center[e.target];
    let routed = false;
    if (sc && tc) {
      const lo = Math.min(sc.x, tc.x);
      const hi = Math.max(sc.x, tc.x);
      routed = dag.nodes.some((n) => {
        if (n.id === e.source || n.id === e.target) return false;
        const c = center[n.id];
        return c && c.x > lo + 1 && c.x < hi - 1;
      });
    }
    return {
      id: e.id ?? `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      routed,
      points: routed ? edgePoints[`${e.source}->${e.target}`] : undefined,
    };
  });

  return { nodes, edges };
}

export const STATUS_ORDER: NodeStatus[] = [
  "idle",
  "queued",
  "running",
  "done",
  "failed",
];

/** Selectable starting states, switchable from the settings menu. */
export type SampleId = "empty" | "subtitle" | "reframe" | "vertical";

/** Shape of a `/sample/*.json` flow file: a DAG plus its menu id + label. */
interface SampleFile extends GeneratedDag {
  id: SampleId;
  label: string;
}

// JSON imports arrive with loose types (e.g. `type: string`), so cast each to
// our sample shape. The flow definitions live in /sample/*.json.
const SUBTITLE = subtitleSample as unknown as SampleFile;
const REFRAME = reframeSample as unknown as SampleFile;
const VERTICAL = verticalSample as unknown as SampleFile;

/**
 * Default demo pipeline ("Bilingual Subtitle Burner"), loaded from
 * /sample/subtitle.json. Also used as the server fallback when no Gemini API
 * key is configured — so the app is always demoable.
 */
export const SAMPLE_DAG: GeneratedDag = SUBTITLE;

/** Second demo pipeline, loaded from /sample/reframe.json. */
export const SAMPLE_DAG_REFRAME: GeneratedDag = REFRAME;

/** Blank starting canvas. */
export const EMPTY_DAG: GeneratedDag = {
  title: "Empty canvas",
  summary: "",
  nodes: [],
  edges: [],
};

export interface SampleOption {
  id: SampleId;
  label: string;
  dag: GeneratedDag;
}

export const SAMPLES: SampleOption[] = [
  { id: SUBTITLE.id, label: SUBTITLE.label, dag: SAMPLE_DAG },
  { id: REFRAME.id, label: REFRAME.label, dag: SAMPLE_DAG_REFRAME },
  { id: VERTICAL.id, label: VERTICAL.label, dag: VERTICAL },
  { id: "empty", label: "Empty canvas", dag: EMPTY_DAG },
];

/** Current default shown on first load — a blank canvas (user starts by prompting). */
export const DEFAULT_SAMPLE_ID: SampleId = "empty";

export function sampleById(id: SampleId): GeneratedDag {
  return SAMPLES.find((s) => s.id === id)?.dag ?? SAMPLE_DAG;
}
