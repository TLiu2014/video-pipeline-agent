"use client";

import {
  Captions,
  Film,
  FolderOpen,
  Image as ImageIcon,
  PanelBottom,
  PanelRight,
  PanelTop,
  X,
} from "lucide-react";
import type { LoadedSource, MediaKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SubtitleEditor } from "./SubtitleEditor";
import { SourcesGallery } from "./SourcesGallery";
import type { ResultsLayout } from "./SettingsMenu";

/** Sentinel tab id for the source-clip library. */
export const SOURCES_TAB = "__sources__";

export interface PreviewItem {
  id: string;
  label: string;
  media: MediaKind;
  /** Produced/source URL; absent when the artifact hasn't been generated yet. */
  url?: string | null;
}

interface ResultsPanelProps {
  items: PreviewItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  layout: ResultsLayout;
  onLayoutChange: (l: ResultsLayout) => void;
  source: LoadedSource | null;
  onSourceLoaded: (s: LoadedSource) => void;
  onClearSource: () => void;
  maxUploadMb: number;
}

/**
 * Results view (pattern from the reference wranglers' ResultsPanel): a tabbed
 * container that previews produced artifacts — a video player for video/image
 * resources, an editable text view for subtitle resources.
 */
export function ResultsPanel({
  items,
  activeId,
  onSelect,
  onClose,
  layout,
  onLayoutChange,
  source,
  onSourceLoaded,
  onClearSource,
  maxUploadMb,
}: ResultsPanelProps) {
  const isSources = activeId === SOURCES_TAB;
  const active = isSources
    ? null
    : items.find((i) => i.id === activeId) ?? items[0] ?? null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-slate-950">
      {/* Header + tabs */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-slate-200 px-2 dark:border-slate-800">
        <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Preview
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {/* Library tab (always first) */}
          <button
            type="button"
            onClick={() => onSelect(SOURCES_TAB)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
              isSources
                ? "bg-indigo-500 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <FolderOpen className="h-3 w-3 shrink-0" />
            Sources
          </button>
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                !isSources && active?.id === it.id
                  ? "bg-indigo-500 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <MediaIcon media={it.media} />
              <span className="max-w-[120px] truncate">{it.label}</span>
            </button>
          ))}
        </div>
        {/* Dock switch + close */}
        <div className="ml-1 flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onLayoutChange("top")}
            aria-label="Dock preview top"
            title="Dock top"
            className={cn(
              "rounded p-1 transition-colors",
              layout === "top"
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800",
            )}
          >
            <PanelTop className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange("right")}
            aria-label="Dock preview right"
            title="Dock right"
            className={cn(
              "rounded p-1 transition-colors",
              layout === "right"
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800",
            )}
          >
            <PanelRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange("bottom")}
            aria-label="Dock preview bottom"
            title="Dock bottom"
            className={cn(
              "rounded p-1 transition-colors",
              layout === "bottom"
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800",
            )}
          >
            <PanelBottom className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide preview"
            title="Hide preview"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isSources ? (
          <SourcesGallery
            current={source}
            onLoaded={onSourceLoaded}
            onClear={onClearSource}
            maxMb={maxUploadMb}
          />
        ) : !active ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Nothing to preview yet.
          </div>
        ) : !active.url ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <MediaIcon media={active.media} />
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {active.label}
            </div>
            <p className="max-w-[240px] text-xs text-slate-400">
              Not generated yet — load a source and run the pipeline to produce
              this {active.media}.
            </p>
          </div>
        ) : active.media === "subtitle" || active.media === "text" ? (
          <SubtitleEditor url={active.url} />
        ) : active.media === "image" ? (
          <div className="flex h-full items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.label}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-900 p-3">
            <video
              key={active.url}
              src={active.url}
              controls
              className="max-h-full max-w-full rounded-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MediaIcon({ media }: { media: MediaKind }) {
  const cls = "h-3 w-3 shrink-0";
  if (media === "subtitle" || media === "text")
    return <Captions className={cls} />;
  if (media === "image") return <ImageIcon className={cls} />;
  return <Film className={cls} />;
}
