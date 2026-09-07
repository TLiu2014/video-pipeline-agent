"use client";

import { useCallback, useRef, useState } from "react";
import { Braces, FileUp, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineEdge, PipelineFlowNode } from "@/lib/types";
import {
  downloadTextFile,
  slugify,
  toPipelineFile,
} from "@/lib/pipelineFile";
import {
  ExportPreviewDialog,
  type ExportPreview,
} from "./ExportPreviewDialog";

interface Props {
  title: string;
  summary: string;
  nodes: PipelineFlowNode[];
  edges: PipelineEdge[];
  /** Receives the chosen .json file to import. */
  onImportFile: (file: File) => void;
}

/**
 * Floating three-button toolbar in the canvas top-right (pattern from the
 * reference builders' CanvasExportToolbar). Each EXPORT button builds a preview
 * then opens `<ExportPreviewDialog>` so the user can inspect / copy before
 * downloading; Import (new) loads a CineDAG pipeline JSON back onto the canvas.
 */
export function CanvasExportToolbar({
  title,
  summary,
  nodes,
  edges,
  onImportFile,
}: Props) {
  const [busy, setBusy] = useState<"png" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filenameBase = slugify(title || "cinedag-pipeline");
  const hasNodes = nodes.length > 0;

  const handleDownload = useCallback((p: ExportPreview) => {
    if (p.kind === "image") {
      const a = document.createElement("a");
      a.href = p.dataUrl;
      a.download = `${p.filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    downloadTextFile(`${p.filename}.json`, p.text);
  }, []);

  async function previewPng() {
    const target = document.querySelector<HTMLElement>(".react-flow");
    if (!target) return;
    setBusy("png");
    setError(null);
    try {
      const { toPng } = await import("html-to-image");
      const dark = document.documentElement.classList.contains("dark");
      const dataUrl = await toPng(target, {
        backgroundColor: dark ? "#020617" : "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) => {
          if (!(node instanceof Element)) return true;
          const cls = node.classList;
          return !(
            cls.contains("react-flow__controls") ||
            cls.contains("react-flow__minimap") ||
            cls.contains("react-flow__attribution")
          );
        },
      });
      setPreview({ kind: "image", dataUrl, filename: filenameBase });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function previewJson() {
    setBusy("json");
    setError(null);
    try {
      const file = toPipelineFile(title, summary, nodes, edges);
      setPreview({
        kind: "json",
        text: JSON.stringify(file, null, 2),
        filename: filenameBase,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-1">
        <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <ToolbarButton
            label="Export PNG"
            onClick={previewPng}
            disabled={busy !== null || !hasNodes}
            icon={
              busy === "png" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )
            }
          />
          <ToolbarButton
            label="Export JSON"
            onClick={previewJson}
            disabled={busy !== null || !hasNodes}
            icon={
              busy === "json" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Braces className="h-3.5 w-3.5" />
              )
            }
          />
          <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <ToolbarButton
            label="Import JSON"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            icon={<FileUp className="h-3.5 w-3.5" />}
          />
        </div>
        {error && (
          <p className="pointer-events-auto rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = ""; // allow re-importing the same file
        }}
      />

      <ExportPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onDownload={handleDownload}
      />
    </>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-2 text-[11px] font-medium text-slate-700 transition-colors",
        "hover:border-slate-200 hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800",
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
