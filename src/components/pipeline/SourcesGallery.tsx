"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Link2, Loader2, Upload, X } from "lucide-react";
import type { LoadedSource } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Clip {
  url: string;
  name: string;
  kind: "sample" | "upload" | "link";
  size?: number;
}

interface SourcesGalleryProps {
  current: LoadedSource | null;
  /** Use a clip as the pipeline source. */
  onLoaded: (s: LoadedSource) => void;
  /** Un-use the current source. */
  onClear: () => void;
  maxMb: number;
}

/** localStorage key for clips the user hid from the library (kept on disk). */
const REMOVED_KEY = "video-agent:removed-clips";

/**
 * Clip library (the results pane "Sources" tab): a gallery of available clips
 * plus upload / paste-link cards. A clip is "used" via its round checkbox
 * (check = current source, blank = unused); the row body itself does nothing.
 */
export function SourcesGallery({
  current,
  onLoaded,
  onClear,
  maxMb,
}: SourcesGalleryProps) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<null | "link" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const persistRemoved = (next: Set<string>) => {
    try {
      localStorage.setItem(REMOVED_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  // Load the hidden-clip set (client-only).
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(REMOVED_KEY) || "[]");
      if (Array.isArray(s)) setRemoved(new Set(s));
    } catch {
      /* ignore */
    }
  }, []);

  // Using a clip brings it back into the library: a clip that becomes the
  // source is un-hidden, so *unchecking* it later just unchecks (keeps it in the
  // tab) rather than re-hiding it. Only the explicit X removes a clip.
  useEffect(() => {
    const url = current?.url;
    if (url && removed.has(url)) {
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(url);
        persistRemoved(next);
        return next;
      });
    }
  }, [current?.url, removed]);

  const refresh = useCallback(async () => {
    try {
      const d = await (await fetch("/api/sources")).json();
      const samples: Clip[] = (d.samples ?? [])
        .filter((s: { available: boolean }) => s.available)
        .map((s: { label: string; url: string; size?: number }) => ({
          url: s.url,
          name: s.label,
          kind: "sample" as const,
          size: s.size,
        }));
      const media: Clip[] = (d.media ?? []).map(
        (m: { name: string; url: string; size: number }) => ({
          url: m.url,
          name: m.name,
          kind: "upload" as const,
          size: m.size,
        }),
      );
      setClips([...samples, ...media]);
    } catch {
      /* ignore */
    }
  }, []);

  // Refresh on mount and whenever the source changes, so a clip loaded from the
  // left panel (or a fresh upload/fetch) shows up in the gallery too.
  useEffect(() => {
    refresh();
  }, [refresh, current?.url]);

  const removeClip = useCallback(
    (url: string) => {
      if (current?.url === url) onClear(); // was the source → un-use it first
      setRemoved((prev) => {
        const next = new Set(prev);
        next.add(url);
        persistRemoved(next);
        return next;
      });
    },
    [current, onClear],
  );

  const fetchLink = async () => {
    const url = link.trim();
    if (!url || busy) return;
    setBusy("link");
    setError(null);
    try {
      const res = await fetch("/api/fetch-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      onLoaded(data.source as LoadedSource);
      setLink("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    if (busy) return;
    if (file.size > maxMb * 1024 * 1024) {
      setError(`File too large (max ${maxMb}MB).`);
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-video", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onLoaded(data.source as LoadedSource);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Hidden clips stay hidden — except the one currently in use, which must
  // always be visible (e.g. re-selected after being removed).
  const visible = clips.filter(
    (c) => c.url === current?.url || !removed.has(c.url),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto p-3">
        {/* Add-source card (spans two clip columns): paste-link on top, upload
            below — same layout as the left-panel loader. */}
        <div className="flex h-[116px] w-[296px] flex-col justify-center gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-900">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLink()}
                placeholder="Paste a video URL…"
                className="h-8 min-w-0 flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={fetchLink}
              disabled={!link.trim() || !!busy}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {busy === "link" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Fetch"
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
          >
            {busy === "upload" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload a video <span className="text-slate-400">(≤{maxMb}MB)</span>
          </button>
        </div>

        {/* Clip cards */}
        {visible.map((c) => {
          const active = current?.url === c.url;
          return (
            <div
              key={c.url}
              className={cn(
                "group relative w-36 overflow-hidden rounded-lg border transition-colors",
                active
                  ? "border-indigo-500 ring-1 ring-indigo-500"
                  : "border-slate-200 dark:border-slate-700",
              )}
            >
              <video
                src={c.url}
                muted
                preload="metadata"
                className="h-20 w-full bg-slate-900 object-cover"
              />

              {/* Use / un-use checkbox (round) */}
              <button
                type="button"
                title={active ? "Uncheck — stop using as source" : "Use as source"}
                aria-label={active ? "Stop using as source" : "Use as source"}
                onClick={() =>
                  active
                    ? onClear()
                    : onLoaded({ kind: c.kind, url: c.url, name: c.name })
                }
                className={cn(
                  "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                  active
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-slate-300 bg-white/90 text-transparent hover:border-indigo-400 hover:text-indigo-300 dark:border-slate-500 dark:bg-slate-800/90",
                )}
              >
                <Check className="h-3 w-3" />
              </button>

              {/* Remove from library (keeps the file on disk) */}
              <button
                type="button"
                title="Remove from library (file stays on disk)"
                aria-label="Remove from library"
                onClick={() => removeClip(c.url)}
                className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>

              <div className="px-2 py-1">
                <div className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {c.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {c.kind}
                  {c.size ? ` · ${(c.size / (1024 * 1024)).toFixed(1)}MB` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex shrink-0 items-start gap-1 border-t border-red-200 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-600 dark:border-red-500/40 dark:text-red-300">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
