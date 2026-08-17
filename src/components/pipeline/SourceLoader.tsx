"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Film,
  Link2,
  Loader2,
  Upload,
  Video,
} from "lucide-react";
import type { LoadedSource } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SampleInfo {
  id: string;
  label: string;
  note: string;
  url: string;
  available: boolean;
}

interface SourceLoaderProps {
  current: LoadedSource | null;
  onLoaded: (s: LoadedSource) => void;
  maxMb: number;
}

/** Load a source video three ways: bundled sample, pasted link, or upload. */
export function SourceLoader({ current, onLoaded, maxMb }: SourceLoaderProps) {
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<null | "link" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSamples(d.samples ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Current source */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <Video className="h-4 w-4 shrink-0 text-indigo-400" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
            {current ? current.name : "No source loaded"}
          </div>
          <div className="text-[10px] text-slate-400">
            {current
              ? `${current.kind} · ${current.size ? mb(current.size) + "MB" : "ready"}`
              : "Pick a sample, paste a link, or upload"}
          </div>
        </div>
      </div>

      {/* Samples */}
      <div className="flex flex-wrap gap-1.5">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!s.available || !!busy}
            onClick={() =>
              onLoaded({ kind: "sample", url: s.url, name: s.label })
            }
            title={
              s.available
                ? `${s.label} · ${s.note}`
                : `Add ${s.url.split("/").pop()} to /public/samples`
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              s.available
                ? "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"
                : "cursor-not-allowed border-dashed border-slate-200 text-slate-400 dark:border-slate-700",
            )}
          >
            <Film className="h-3 w-3" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Paste link */}
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
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {busy === "link" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Fetch"
          )}
        </button>
      </div>

      {/* Upload */}
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
        Upload a video{" "}
        <span className="text-slate-400">(≤{maxMb}MB)</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      {error && (
        <div className="flex items-start gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-[11px] text-red-600 dark:text-red-300">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
