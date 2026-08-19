"use client";

import { useState } from "react";
import { Key, Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Persist a new key (empty string clears it). */
  onApiKeySet: (apiKey: string) => void;
  /** The key currently stored in the browser (null = none). */
  currentApiKey: string | null;
  /** Whether the server already has a key in env (GOOGLE_API_KEY). */
  hasServerKey?: boolean;
}

/**
 * BYOK Gemini key input (pattern from the gemini-data-wrangler ApiKeyInput,
 * ported to CineDAG's Tailwind styling). When a key is stored it collapses to a
 * status chip + "Change"; otherwise it shows the entry form. The key lives only
 * in this browser's localStorage and rides on requests as `x-gemini-key`.
 */
export function ApiKeyInput({
  onApiKeySet,
  currentApiKey,
  hasServerKey = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentApiKey ?? "");
  const [show, setShow] = useState(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onApiKeySet(trimmed);
    setEditing(false);
    setShow(false);
  };

  // Collapsed status view when a key is set and we're not editing it.
  if (currentApiKey && !editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 dark:border-emerald-500/50 dark:bg-emerald-500/10">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs text-emerald-800 dark:text-emerald-200">
            Using your Gemini key
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setValue(currentApiKey);
              setEditing(true);
            }}
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              onApiKeySet("");
              setValue("");
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        <Key className="h-3.5 w-3.5" /> Gemini API key
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="AIza…"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pr-8 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide key" : "Show key"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className={cn(
            "flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-colors",
            value.trim()
              ? "bg-indigo-500 hover:bg-indigo-600"
              : "cursor-not-allowed bg-slate-300 dark:bg-slate-700",
          )}
        >
          {currentApiKey ? "Update key" : "Save key"}
        </button>
        {currentApiKey && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setShow(false);
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-slate-400">
        {hasServerKey ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            A server key is configured — add your own to override it.
          </span>
        ) : (
          "No server key set. Add your own to generate & run with Gemini."
        )}{" "}
        Stored only in this browser. Get one from{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Google AI Studio
        </a>
        .
      </p>
    </div>
  );
}
