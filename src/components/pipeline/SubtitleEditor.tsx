"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard, Loader2, Save } from "lucide-react";

/** Load, edit and save a subtitle (.srt/.vtt) file served under /renders. */
export function SubtitleEditor({
  url,
  onReburn,
  reburning,
}: {
  url: string;
  /** Re-run the burn (+ downstream) using the saved subtitle — no Gemini. */
  onReburn?: () => void;
  reburning?: boolean;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setDirty(false);
    // The file is served statically; read it directly.
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Not found"))))
      .then((t) => alive && (setContent(t), setLoading(false)))
      .catch(() => {
        if (alive) {
          setError("Could not load subtitles (run the pipeline first).");
          setContent("");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/subtitle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Strip the cache-bust query — the writer needs the clean file path.
        body: JSON.stringify({ url: url.split("?")[0], content }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save any pending edits, then re-burn the video from this subtitle onward
  // (ffmpeg only — Gemini transcription is NOT re-run, so edits are preserved).
  const saveAndReburn = async () => {
    if (!onReburn) return;
    if (dirty && !(await save())) return;
    onReburn();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate font-mono text-[11px] text-slate-400">
          {url}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? "Saved" : "Save"}
          </button>
          {onReburn && (
            <button
              type="button"
              onClick={saveAndReburn}
              disabled={saving || loading || reburning}
              title="Save edits and re-render the video from here (FFmpeg only — no Gemini)"
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reburning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clapperboard className="h-3.5 w-3.5" />
              )}
              {reburning ? "Re-burning…" : "Save & re-burn"}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none dark:text-slate-200"
          placeholder="No subtitles yet — run the pipeline to generate them."
        />
      )}
      {error && (
        <div className="border-t border-red-200 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-600 dark:border-red-500/40 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
