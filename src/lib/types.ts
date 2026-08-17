/**
 * Shared pipeline contract.
 *
 * A video pipeline is a DAG that STRICTLY ALTERNATES between two node families:
 *
 *   Resource ──▶ Operation ──▶ Resource ──▶ Operation ──▶ Resource
 *   (media)      (ADK agent)   (media)      (ADK agent)   (media)
 *
 * Resource nodes are concrete media artifacts (files); Operation nodes are the
 * ADK agents / tools that consume upstream resources and emit downstream ones.
 */

export type MediaKind = "video" | "audio" | "subtitle" | "image" | "text";

/** Which runtime performs an operation. */
export type OperationEngine =
  | "ffmpeg" // deterministic media transform (crop, mux, burn subs, transcode)
  | "gemini" // multimodal reasoning (transcribe, translate, describe, dub script)
  | "tts"; // text-to-speech synthesis for AI dubbing

/** Real-time execution state shared by nodes, edges and the legend. */
export type NodeStatus = "idle" | "queued" | "running" | "done" | "failed";

/** Data carried by a Resource (media) node. */
export interface ResourceNodeData extends Record<string, unknown> {
  nodeClass: "resource";
  label: string;
  media: MediaKind;
  /** Suggested / produced filename, e.g. "raw.mp4", "audio.wav", "subs.en.srt". */
  filename: string;
  description?: string;
  status: NodeStatus;
  /** Public URL of the produced artifact once the upstream op has run. */
  outputUrl?: string | null;
  /** True for a root resource: the pipeline's input source video. */
  isSource?: boolean;
}

/** Data carried by an Operation (ADK agent) node. */
export interface OperationNodeData extends Record<string, unknown> {
  nodeClass: "operation";
  /** Human agent name, e.g. "Audio Extractor", "Subtitle Burner". */
  label: string;
  /** Short role/description of what this agent does. */
  agent: string;
  engine: OperationEngine;
  /** The FFmpeg command template (for ffmpeg ops) with {in}/{out} placeholders. */
  command?: string;
  description?: string;
  status: NodeStatus;
  /** Hard failure message (shown red). */
  error?: string | null;
  /** Informational skip reason (shown amber), e.g. "no GOOGLE_API_KEY". */
  note?: string | null;
}

export type PipelineNodeData = ResourceNodeData | OperationNodeData;

/** React Flow node discriminated by `type`. */
export interface ResourceFlowNode {
  id: string;
  type: "resource";
  position: { x: number; y: number };
  data: ResourceNodeData;
}
export interface OperationFlowNode {
  id: string;
  type: "operation";
  position: { x: number; y: number };
  data: OperationNodeData;
}
export type PipelineFlowNode = ResourceFlowNode | OperationFlowNode;

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** True when the edge spans over an intermediate node (a skip-edge). */
  routed?: boolean;
  /** dagre-computed waypoints (flow coords) used to route a skip-edge around
   *  the nodes it would otherwise cross. */
  points?: Array<{ x: number; y: number }>;
}

/**
 * Raw shape the ADK builder returns (positions + status are added client-side,
 * so the model never has to reason about coordinates or runtime state).
 */
export interface GeneratedDag {
  title: string;
  summary: string;
  nodes: Array<{
    id: string;
    type: "resource" | "operation";
    data: Record<string, unknown>;
  }>;
  edges: Array<{ id?: string; source: string; target: string; label?: string }>;
}

/** A video source loaded onto the canvas (sample clip, fetched link, or upload). */
export interface LoadedSource {
  /** How it got here. */
  kind: "sample" | "link" | "upload";
  /** Served URL for preview, e.g. "/samples/blazes.mp4" or "/media/abc.mp4". */
  url: string;
  /** Display name. */
  name: string;
  /** Size in bytes, when known. */
  size?: number;
}

export interface GenerateDagResponse {
  dag: GeneratedDag;
  /** True when the server had no API key and returned a canned demo pipeline. */
  fallback: boolean;
  /** Non-fatal note surfaced to the UI (e.g. why the fallback kicked in). */
  note?: string;
}
