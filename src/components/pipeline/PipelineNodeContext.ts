import { createContext, useContext } from "react";

/** Callbacks the canvas passes down to every node (pattern from DAGtor). */
export interface PipelineNodeCallbacks {
  /** Open the produced artifact of a resource node in the results view. */
  onPreview?: (nodeId: string) => void;
  /** Id of the node whose details popover is currently open (single at a time). */
  detailsId?: string | null;
  /** Toggle the details popover for a node (closes others). */
  onToggleDetails?: (nodeId: string) => void;
}

export const PipelineNodeContext = createContext<PipelineNodeCallbacks>({});

export function usePipelineNodeCallbacks(): PipelineNodeCallbacks {
  return useContext(PipelineNodeContext);
}
