import type { MediaKind, NodeStatus, OperationEngine } from "@/lib/types";
import {
  AudioLines,
  Captions,
  Film,
  FileText,
  Image as ImageIcon,
  Scissors,
  Sparkles,
  AudioWaveform,
  type LucideIcon,
} from "lucide-react";

export interface StatusStyle {
  label: string;
  color: string; // hex — border accent + inline styles + edge gradients
  body: string; // Tailwind classes for the node body
  pulse: boolean; // pulse while actively working / waiting
  glow: string; // rgba glow used by the pulse animation
}

/** One descriptor per real-time node state (see NodeStatus). */
export const STATUS_STYLES: Record<NodeStatus, StatusStyle> = {
  idle: {
    label: "Idle",
    color: "#8b5cf6",
    body: "bg-violet-50 dark:bg-violet-950/40",
    pulse: false,
    glow: "rgba(139,92,246,0.45)",
  },
  queued: {
    label: "Queued",
    color: "#3b82f6",
    body: "bg-blue-50 dark:bg-blue-950/40",
    pulse: true,
    glow: "rgba(59,130,246,0.55)",
  },
  running: {
    label: "Running",
    color: "#f59e0b",
    body: "bg-amber-50 dark:bg-amber-950/40",
    pulse: true,
    glow: "rgba(245,158,11,0.55)",
  },
  done: {
    label: "Done",
    color: "#10b981",
    body: "bg-emerald-50 dark:bg-emerald-950/40",
    pulse: false,
    glow: "rgba(16,185,129,0.5)",
  },
  failed: {
    label: "Failed",
    color: "#ef4444",
    body: "bg-red-50 dark:bg-red-950/40",
    pulse: false,
    glow: "rgba(239,68,68,0.5)",
  },
};

/** Icon per media type (Resource nodes). */
export const MEDIA_ICONS: Record<MediaKind, LucideIcon> = {
  video: Film,
  audio: AudioLines,
  subtitle: Captions,
  image: ImageIcon,
  text: FileText,
};

/** Icon per operation engine (Operation nodes). */
export const ENGINE_ICONS: Record<OperationEngine, LucideIcon> = {
  ffmpeg: Scissors,
  gemini: Sparkles,
  tts: AudioWaveform,
};

/** Accent color per engine so agents read distinct from media resources. */
export const ENGINE_COLORS: Record<OperationEngine, string> = {
  ffmpeg: "#6366f1", // indigo
  gemini: "#0ea5e9", // sky
  tts: "#ec4899", // pink
};
