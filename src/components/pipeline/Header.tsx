"use client";

import { CineDagTile } from "@/components/brand/CineDagMark";
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
  apiKey: string | null;
  onApiKeySet: (key: string) => void;
  hasServerKey: boolean;
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
  apiKey,
  onApiKeySet,
  hasServerKey,
}: HeaderProps) {
  return (
    <header className="z-20 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <CineDagTile size={34} />
        <div className="text-base font-semibold leading-none text-slate-900 dark:text-slate-100">
          Cine<span className="text-indigo-500">DAG</span>
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
          apiKey={apiKey}
          onApiKeySet={onApiKeySet}
          hasServerKey={hasServerKey}
        />
      </div>
    </header>
  );
}
