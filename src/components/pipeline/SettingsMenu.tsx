"use client";

import { useEffect, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  X,
  Cpu,
  Server,
  MonitorSmartphone,
  Sun,
  Moon,
  Github,
  Check,
  PanelRight,
  PanelBottom,
  PanelTop,
  PanelBottomClose,
} from "lucide-react";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";
import { SAMPLES, type SampleId } from "@/lib/dag";

export type ResultsLayout = "hidden" | "top" | "right" | "bottom";

export interface AppSettings {
  /** Animate media flowing along edges. */
  animateEdges: boolean;
  /** Auto-fit the view whenever a new pipeline is generated. */
  autoFit: boolean;
  /** Where the results/preview pane docks relative to the canvas. */
  resultsLayout: ResultsLayout;
  /** Pan/zoom to follow the in-progress node during a run. */
  followActive: boolean;
  /** Show the source-loader controls in the left side panel. */
  showSourceLoader: boolean;
}

interface SettingsMenuProps {
  settings: AppSettings;
  onChange: (next: Partial<AppSettings>) => void;
  /** Currently loaded sample pipeline (or empty canvas). */
  sample: SampleId;
  onSampleChange: (id: SampleId) => void;
  /** Server-configured execution mode (read-only; set via EXECUTION_MODE). */
  executionMode: string;
  model: string;
}

/**
 * Top-right settings menu: a gear button toggling a floating panel with manual
 * click-outside + Escape dismissal (hand-rolled pattern reused from AtlasOrbit /
 * Q-Pilot / DAGtor). Groups appearance + engine + about options.
 */
export function SettingsMenu({
  settings,
  onChange,
  sample,
  onSampleChange,
  executionMode,
  model,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !panelRef.current?.contains(t) &&
        !buttonRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isReplit = executionMode === "replit";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
          open
            ? "border-indigo-400 bg-indigo-50 text-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        )}
      >
        <SettingsIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Application settings"
          className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Settings
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Appearance */}
          <Section label="Appearance">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Theme
              </span>
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                {(
                  [
                    ["light", Sun],
                    ["dark", Moon],
                  ] as [Theme, typeof Sun][]
                ).map(([t, Icon]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    aria-pressed={theme === t}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs capitalize transition-colors",
                      theme === t
                        ? "bg-indigo-500 text-white"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <ToggleRow
              label="Animate media flow"
              checked={settings.animateEdges}
              onChange={(v) => onChange({ animateEdges: v })}
            />
            <ToggleRow
              label="Auto-fit on generate"
              checked={settings.autoFit}
              onChange={(v) => onChange({ autoFit: v })}
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Results view
              </span>
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                {(
                  [
                    ["hidden", "Off", PanelBottomClose],
                    ["top", "Top", PanelTop],
                    ["right", "Right", PanelRight],
                    ["bottom", "Bottom", PanelBottom],
                  ] as [ResultsLayout, string, typeof PanelRight][]
                ).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange({ resultsLayout: v })}
                    aria-pressed={settings.resultsLayout === v}
                    title={`Results ${label}`}
                    className={cn(
                      "inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
                      settings.resultsLayout === v
                        ? "bg-indigo-500 text-white"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
            <ToggleRow
              label="Follow active node"
              checked={settings.followActive}
              onChange={(v) => onChange({ followActive: v })}
            />
            <ToggleRow
              label="Source loader in panel"
              checked={settings.showSourceLoader}
              onChange={(v) => onChange({ showSourceLoader: v })}
            />
          </Section>

          {/* Sample pipeline */}
          <Section label="Sample pipeline">
            <p className="text-[11px] leading-snug text-slate-400">
              Load a demo pipeline onto the canvas, or start blank.
            </p>
            <div className="flex flex-col gap-1">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSampleChange(s.id)}
                  aria-pressed={sample === s.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                    sample === s.id
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  {s.label}
                  {sample === s.id && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </Section>

          {/* Engine */}
          <Section label="Engine">
            <InfoRow
              icon={Cpu}
              label="Model"
              value={model}
              hint="Google ADK · Gemini"
            />
            <InfoRow
              icon={isReplit ? Server : MonitorSmartphone}
              label="Execution"
              value={isReplit ? "Replit Cloud" : "Local FFmpeg"}
              hint={
                isReplit
                  ? "Scripts run on a remote Replit workspace"
                  : "FFmpeg runs on this machine"
              }
            />
            <p className="mt-1 text-[11px] leading-snug text-slate-400">
              Switch modes with{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                EXECUTION_MODE
              </code>{" "}
              in <code>.env.local</code>.
            </p>
          </Section>

          {/* About */}
          <Section label="About" last>
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              <strong>CineDAG</strong> — describe a video workflow and a Gemini
              multi-agent pipeline builds &amp; runs it. An Agentic Cinema
              project.
            </p>
            <a
              href="https://github.com/TLiu2014/video-pipeline-agent"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <Github className="h-3.5 w-3.5" /> View source
            </a>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-2.5 py-3",
        !last && "border-b border-slate-100 dark:border-slate-800",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {label}
          </span>
          <span className="truncate font-mono text-xs text-slate-900 dark:text-slate-100">
            {value}
          </span>
        </div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}
