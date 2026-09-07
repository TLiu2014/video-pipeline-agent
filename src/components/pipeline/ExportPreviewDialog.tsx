"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";

/**
 * What the export dialog is previewing. `image` carries a ready-to-save PNG
 * data URL; `json` carries a text payload. `filename` is the base name (no
 * extension — the download handler appends `.png` / `.json`).
 */
export type ExportPreview =
  | { kind: "image"; dataUrl: string; filename: string }
  | { kind: "json"; text: string; filename: string };

interface Props {
  preview: ExportPreview | null;
  onClose: () => void;
  onDownload: (preview: ExportPreview) => void;
}

/**
 * Preview-before-save dialog for the canvas export actions (pattern reused from
 * the reference builders' ExportPreviewDialog, ported to CineDAG's styling).
 * Images render inline; JSON renders in a monospace block with a Copy button.
 * Both expose Download, which defers to the host's `onDownload`.
 */
export function ExportPreviewDialog({ preview, onClose, onDownload }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!preview) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview, onClose]);

  if (!preview) return null;

  const isText = preview.kind === "json";

  const handleCopy = async () => {
    if (!isText) return;
    try {
      await navigator.clipboard.writeText(preview.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — silently no-op */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isText ? "Export pipeline JSON" : "Export canvas image"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isText ? "Export pipeline JSON" : "Export canvas as PNG"}
            </h2>
            <p className="text-xs text-slate-400">
              {isText
                ? "Preview the CineDAG pipeline — copy or download the .json file."
                : "Preview the diagram PNG before saving."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {preview.kind === "image" ? (
            <div className="bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] p-4 dark:bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.dataUrl}
                alt="Canvas export preview"
                className="mx-auto block max-w-full rounded-md shadow"
              />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words bg-slate-50 p-4 font-mono text-xs leading-snug text-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {preview.text}
            </pre>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          {isText && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />{" "}
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDownload(preview)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
          >
            <Download className="h-4 w-4" /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
