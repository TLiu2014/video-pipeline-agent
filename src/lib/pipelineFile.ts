import type { GeneratedDag, PipelineEdge, PipelineFlowNode } from "./types";

/**
 * CineDAG's own portable pipeline file. It's just a GeneratedDag (the shape the
 * builder agent emits and `hydrateDag` consumes) with a format marker, minus
 * runtime state — so an exported file re-imports to a clean, un-run pipeline.
 * This format is private to CineDAG; we're free to evolve it via `version`.
 */
export const PIPELINE_FILE_FORMAT = "cinedag-pipeline";

/** Node-data keys that are runtime-only and must not be serialized. */
const RUNTIME_KEYS = new Set(["status", "outputUrl", "error", "note", "isSource"]);

export interface PipelineFile {
  format: typeof PIPELINE_FILE_FORMAT;
  version: 1;
  title: string;
  summary: string;
  nodes: GeneratedDag["nodes"];
  edges: GeneratedDag["edges"];
}

/** Serialize the live canvas into a portable pipeline file (no runtime state). */
export function toPipelineFile(
  title: string,
  summary: string,
  nodes: PipelineFlowNode[],
  edges: PipelineEdge[],
): PipelineFile {
  return {
    format: PIPELINE_FILE_FORMAT,
    version: 1,
    title: title || "CineDAG Pipeline",
    summary: summary || "",
    nodes: nodes.map((n) => {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(n.data)) {
        if (!RUNTIME_KEYS.has(k) && v !== undefined) data[k] = v;
      }
      return { id: n.id, type: n.type, data };
    }),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      ...(e.label ? { label: e.label } : {}),
    })),
  };
}

/** Parse + validate an imported file into a GeneratedDag. Throws on bad input. */
export function parsePipelineFile(raw: string): GeneratedDag {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("File isn't valid JSON.");
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("File isn't a pipeline object.");
  }
  const f = obj as Partial<PipelineFile>;
  if (f.format && f.format !== PIPELINE_FILE_FORMAT) {
    throw new Error(`Unrecognized format "${String(f.format)}".`);
  }
  if (!Array.isArray(f.nodes) || f.nodes.length === 0) {
    throw new Error("File has no pipeline nodes.");
  }
  if (!Array.isArray(f.edges)) {
    throw new Error("File has no edges array.");
  }
  for (const n of f.nodes) {
    if (
      !n ||
      typeof n !== "object" ||
      typeof (n as { id?: unknown }).id !== "string" ||
      ((n as { type?: unknown }).type !== "resource" &&
        (n as { type?: unknown }).type !== "operation")
    ) {
      throw new Error("A node is missing a valid id/type.");
    }
  }
  return {
    title: String(f.title ?? "Imported Pipeline"),
    summary: String(f.summary ?? ""),
    nodes: f.nodes as GeneratedDag["nodes"],
    edges: f.edges as GeneratedDag["edges"],
  };
}

/** Filesystem-safe base name from a pipeline title. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "cinedag-pipeline"
  );
}

/** Trigger a browser download of `text` as `filename`. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = "application/json",
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
