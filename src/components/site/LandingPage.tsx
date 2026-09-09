"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Cpu,
  Film,
  Play,
  PlayCircle,
  Server,
  Sparkles,
  Wand2,
  Workflow,
} from "lucide-react";
import { CineDagTile } from "@/components/brand/CineDagMark";
import { SectionHeading, SiteFooter, SiteNav } from "./SiteChrome";
import { PipelineDiagram } from "./diagrams";

const DEMO_VIDEO_URL = "https://youtu.be/tg5KCGneYFc";

const FEATURES = [
  {
    icon: Wand2,
    title: "Prompt → pipeline",
    body: "Describe a workflow in plain English. The Google ADK + Gemini plan a multi-agent DAG that strictly alternates media files and operations.",
  },
  {
    icon: Play,
    title: "Run it for real",
    body: "Not a mockup — FFmpeg executes each step (locally or offloaded to Replit) with a live trace, and the produced video previews in-app.",
  },
  {
    icon: Sparkles,
    title: "Multimodal, AI-native",
    body: "Gemini transcribes + translates for bilingual subtitles and analyzes the frame for a subject-aware vertical reframe. Video, audio, text — one graph.",
  },
  {
    icon: Workflow,
    title: "Visual + editable",
    body: "A React Flow canvas with routed edges, live node status, a video player, and an editable subtitle view. Swap FFmpeg↔Replit with one env var.",
  },
];

const UNDER_HOOD = [
  {
    icon: Sparkles,
    title: "Gemini via the Google ADK",
    body: "One Gemini model (gemini-3.5-flash, set by GEMINI_MODEL) powers both the build agent that plans the DAG and the run-time agents that transcribe, translate and analyze video — all driven through the ADK's LlmAgent + runner.",
  },
  {
    icon: Server,
    title: "Replit for cloud execution",
    body: "In cloud mode, FFmpeg is offloaded to a Replit-hosted executor over HTTP and outputs stream back for preview. The Gemini calls stay local, so your API key never leaves your machine.",
  },
  {
    icon: Film,
    title: "FFmpeg media engine",
    body: "Deterministic transforms — extract audio, crop, burn subtitles, transcode, reframe — run via child_process (or the remote Replit executor). Gemini handles the understanding; FFmpeg handles the pixels.",
  },
  {
    icon: Workflow,
    title: "React Flow + Next.js",
    body: "A React Flow canvas with a dagre layout renders the live pipeline and streamed run status; Next.js (App Router) serves both the UI and the API routes.",
  },
];

const STACK = [
  "Next.js",
  "React Flow",
  "Google ADK",
  "Gemini",
  "FFmpeg",
  "Replit",
  "Tailwind CSS",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <SiteNav active="home" />

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-gradient-to-b from-indigo-300/25 via-transparent to-transparent blur-3xl dark:from-indigo-500/10"
        />
        <div className="relative z-10 max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Agentic Cinema hackathon · Replit Partner Track
          </div>
          <div className="flex items-center gap-4">
            <CineDagTile size={64} className="rounded-2xl" />
            <h1 className="text-5xl font-bold leading-none tracking-tight sm:text-6xl">
              Cine<span className="text-indigo-500">DAG</span>
            </h1>
          </div>
          <p className="mt-6 text-lg leading-relaxed text-slate-600 dark:text-slate-300 sm:text-xl">
            Describe a video workflow in plain English and a{" "}
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              Gemini
            </span>{" "}
            multi-agent pipeline{" "}
            <span className="font-semibold">builds</span> and{" "}
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              runs
            </span>{" "}
            it — AI dubbing, bilingual subtitle burning, speaker-tracked vertical
            reframing — executed on local FFmpeg or a Replit cloud workspace.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/app"
              className="group inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-[1.02]"
            >
              Launch app
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-6 py-3 text-base font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
            >
              <PlayCircle className="h-4 w-4" />
              Watch the 3-min demo
            </a>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <BookOpen className="h-4 w-4" />
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — general alternating DAG */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <SectionHeading
          eyebrow="How it works"
          title="A strictly-alternating media DAG"
          lede="Every pipeline alternates between resource nodes (concrete media — a video, an audio track, a subtitle file) and operation nodes (the ADK agents / FFmpeg steps that transform them). The generated graph always follows this shape:"
          className="mb-6"
        />
        <PipelineDiagram />
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Resource —
            concrete media
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Operation
            — a Gemini agent or an FFmpeg step
          </span>
        </div>
      </section>

      {/* Under the hood */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <SectionHeading
          eyebrow="Under the hood"
          title="Gemini, the ADK, FFmpeg — and Replit for scale"
          className="mb-6"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {UNDER_HOOD.map((u) => (
            <div
              key={u.title}
              className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                <u.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {u.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {u.body}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="font-medium uppercase tracking-wider">Stack</span>
          {STACK.map((s) => (
            <span
              key={s}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-500 dark:border-slate-700 dark:text-slate-400"
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* Execution modes */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Cpu className="h-5 w-5 text-indigo-500" />
              <span className="font-semibold">Local FFmpeg</span>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Fast dev loop — operations run on your machine via{" "}
              <code className="rounded bg-slate-100 px-1 text-[12px] dark:bg-slate-800">
                child_process
              </code>
              .
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Server className="h-5 w-5 text-sky-500" />
              <span className="font-semibold">Replit cloud</span>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Offload FFmpeg to a Replit executor over HTTP — flip{" "}
              <code className="rounded bg-slate-100 px-1 text-[12px] dark:bg-slate-800">
                EXECUTION_MODE
              </code>
              , no app changes.
            </p>
          </div>
        </div>
      </section>

      {/* CTA — primary components on a light secondary background */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-8 text-center dark:border-indigo-500/30 dark:bg-indigo-950/30 sm:p-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
            Build a video pipeline by prompt
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-500 dark:text-slate-400">
            Load a clip, describe what you want, and watch the agents build and
            run it — demoable even without an API key.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-[1.02]"
            >
              Launch app <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-6 py-3 text-base font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-transparent dark:text-indigo-300 dark:hover:bg-indigo-500/10"
            >
              <BookOpen className="h-4 w-4" /> Read the docs
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
