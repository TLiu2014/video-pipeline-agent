import type {
  OperationNodeData,
  PipelineNodeData,
  ResourceNodeData,
} from "@/lib/types";

/**
 * Whether a node carries more than its card already shows — i.e. whether the
 * "expand details" (eye) affordance should appear. Cards truncate long text and
 * omit some fields; the inspector reveals the rest.
 */
export function hasExtraDetails(data: PipelineNodeData): boolean {
  if (data.nodeClass === "resource") {
    const d = data as ResourceNodeData;
    return Boolean(d.description || d.outputUrl);
  }
  const d = data as OperationNodeData;
  return Boolean(d.command || d.agent || d.description || d.error || d.note);
}
