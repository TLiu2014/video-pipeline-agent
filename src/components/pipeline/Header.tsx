"use client";

import { Clapperboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SettingsMenu, type AppSettings } from "./SettingsMenu";
import type { SampleId } from "@/lib/dag";

interface HeaderProps {
  settings: AppSettings;
  onSettingsChange: (next: Partial<AppSettings>) => void;
  sample: SampleId;
  onSampleChange: (id: SampleId) => void;
  executionMode: string;
  model: string;
}

/** Slim top bar: brand on the left, settings + theme on the right. The prompt
 *  input now lives in the left side panel. */
export function Header({
  settings,
  onSettingsChange,
  sample,
  onSampleChange,
  executionMode,
  model,
}: HeaderProps) {
  return (
    <header className="z-20 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow">
          <Clapperboard className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
            Agentic Cinema
          </div>
          <div className="text-[11px] leading-tight text-slate-400">
            Multimodal Video Pipeline Builder
          </div>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <SettingsMenu
          settings={settings}
          onChange={onSettingsChange}
          sample={sample}
          onSampleChange={onSampleChange}
          executionMode={executionMode}
          model={model}
        />
      </div>
    </header>
  );
}
