import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

interface RoutedEdgeData {
  /** True when this edge should follow dagre waypoints around intermediate nodes. */
  routed?: boolean;
  /** dagre waypoints in flow coords (ordered source → target). */
  points?: Array<{ x: number; y: number }>;
  /** Whether to animate the "flowing media" dashes. */
  flowing?: boolean;
  [key: string]: unknown;
}

type Pt = { x: number; y: number };

/** Smooth (Catmull-Rom → cubic bezier) path through an ordered list of points. */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2)
    return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/**
 * Edge renderer: a plain bezier for simple adjacent edges, but skip-edges (which
 * span over an intermediate node) follow dagre's routing waypoints so they arc
 * cleanly around the nodes instead of being clipped by their borders.
 */
export function RoutedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const d = (data ?? {}) as RoutedEdgeData;
  let path: string;

  if (d.routed && d.points && d.points.length >= 2) {
    // Use the real handle coords as endpoints, dagre's interior points as the
    // corridor the edge threads through.
    const interior = d.points.slice(1, -1);
    path = smoothPath([
      { x: sourceX, y: sourceY },
      ...interior,
      { x: targetX, y: targetY },
    ]);
  } else {
    [path] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={style}
      className={d.flowing ? "edge-flowing" : undefined}
    />
  );
}
