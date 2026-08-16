import { createContext, useContext } from "react";

/** Callbacks the canvas passes down to every node (pattern from DAGtor). */
export interface PipelineNodeCallbacks {
  /** Open the read-only details inspector for a node. */
  onShowDetails?: (nodeId: string) => void;
}

export const PipelineNodeContext = createContext<PipelineNodeCallbacks>({});

export function usePipelineNodeCallbacks(): PipelineNodeCallbacks {
  return useContext(PipelineNodeContext);
}
