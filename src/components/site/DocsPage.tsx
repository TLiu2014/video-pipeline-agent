"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Captions,
  Cpu,
  FileVideo,
  Film,
  Server,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { GITHUB_URL, SectionHeading, SiteFooter, SiteNav } from "./SiteChrome";
import { ArchitectureDiagram, PipelineDiagram } from "./diagrams";
import { cn } from "@/lib/utils";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </code>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-3 leading-relaxed text-slate-600 dark:text-slate-300">
      {children}
    </div>
  );
}

const SECTIONS = [
  { id: "architecture", label: "Architecture" },
  { id: "build", label: "Building the pipeline" },
  { id: "gemini", label: "Gemini & the ADK" },
  { id: "execution", label: "Execution engine" },
  { id: "replit", label: "Running on Replit" },
  { id: "multimodal", label: "Multimodal operations" },
  { id: "stack", label: "Tech stack" },
];

/** Floating "back to top" button, shown once scrolled down. */
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-6 right-6 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        show ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen w-full bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <SiteNav active="docs" />
      <BackToTop />

      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Intro */}
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Documentation
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            How CineDAG works
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
            A prompt becomes a multi-agent video pipeline: the Google ADK +
            Gemini plan a Resource/Operation DAG, an executor runs the FFmpeg +
            Gemini steps (locally or on Replit), and the produced media previews
            in-app.
          </p>
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-12">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                On this page
              </div>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-md px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="min-w-0">
            {/* Architecture */}
            <section id="architecture" className="scroll-mt-24">
              <SectionHeading eyebrow="Overview" title="Architecture" />
              <Prose>
                <p>
                  CineDAG is a Next.js app. The whole flow — prompt → build → run
                  → preview — happens through these stages:
                </p>
              </Prose>
              <div className="mt-5">
                <ArchitectureDiagram />
              </div>
              <Prose>
                <p>
                  Only <b>FFmpeg</b> is offloaded to Replit in cloud mode; the{" "}
                  <b>Gemini</b> calls always run on the Next server, so your{" "}
                  <Code>GEMINI_API_KEY</Code> never leaves your machine.
                </p>
              </Prose>
            </section>

            {/* Build */}
            <section id="build" className="mt-14 scroll-mt-24">
              <SectionHeading
                eyebrow="Planning"
                title="Building the pipeline"
                lede="A prompt is sent to an ADK LlmAgent (Gemini) that returns JSON — a list of nodes + edges. The graph strictly alternates two node families:"
              />
              <div className="mt-5">
                <PipelineDiagram />
              </div>
              <Prose>
                <p>
                  <b>Resource</b> nodes are concrete media artifacts (a video, an
                  audio track, a subtitle file). <b>Operation</b> nodes are the
                  agents/tools that consume upstream resources and produce
                  downstream ones. The client lays the graph out with dagre and
                  routes skip-edges around nodes, so the model never emits
                  coordinates.
                </p>
                <p>
                  Sample flows are plain JSON in <Code>/sample/*.json</Code>; with
                  no API key the builder returns a canned sample so the app is
                  always demoable.
                </p>
              </Prose>
            </section>

            {/* Gemini & the ADK */}
            <section id="gemini" className="mt-14 scroll-mt-24">
              <SectionHeading
                eyebrow="Agents"
                title="Gemini & the ADK"
                lede="The app talks to Gemini through the Google Agent Development Kit — an LlmAgent driven by an in-memory runner. One model does everything."
              />
              <Prose>
                <p>
                  A single Gemini model — <Code>gemini-3.5-flash</Code> by
                  default, set with <Code>GEMINI_MODEL</Code> — powers every
                  Gemini step. There&apos;s no separate &ldquo;planner&rdquo; vs
                  &ldquo;worker&rdquo; model; it&apos;s one model with two kinds
                  of prompt:
                </p>
              </Prose>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <Sparkles className="h-4 w-4 text-violet-500" /> Build agent
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                    Structured-JSON output (<Code>responseMimeType</Code>) turns
                    your prompt into the Resource/Operation DAG.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <Film className="h-4 w-4 text-indigo-500" /> Run-time agents
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                    Multimodal input — audio/video sent inline — returns timed
                    subtitle segments or a crop focal point.
                  </p>
                </div>
              </div>
              <Prose>
                <p>
                  Each operation node is an agent/tool step: Gemini-backed steps
                  run through the ADK&apos;s <Code>LlmAgent</Code> +{" "}
                  <Code>InMemoryRunner</Code>; FFmpeg steps are deterministic
                  tools. The ADK gives us the runner and the multimodal message
                  plumbing (inline audio/video parts).
                </p>
              </Prose>
            </section>

            {/* Execution */}
            <section id="execution" className="mt-14 scroll-mt-24">
              <SectionHeading
                eyebrow="Running"
                title="Execution engine"
                lede="Both engines implement one ExecutorService, so switching is a single env var — no app changes."
              />
              <Prose>
                <p>
                  <Code>EXECUTION_MODE</Code> (in <Code>.env.local</Code>) picks
                  the runner: <Code>local</Code> runs FFmpeg on your machine via{" "}
                  <Code>child_process</Code>; <Code>replit</Code> offloads it to a
                  cloud executor.
                </p>
              </Prose>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <Cpu className="h-4 w-4 text-indigo-500" /> LocalFfmpegRunner
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                    Runs <Code>ffmpeg</Code> in a renders working dir; skips an op
                    whose inputs weren&apos;t produced (e.g. the burner with no
                    subs).
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <Server className="h-4 w-4 text-sky-500" /> ReplitCloudRunner
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                    Uploads the source, runs FFmpeg on a Replit executor over
                    HTTP, downloads outputs for preview. Gemini steps stay local.
                  </p>
                </div>
              </div>
              <Prose>
                <p>
                  Execution streams NDJSON events, so the trace shows each step
                  live (with FFmpeg logs) and the canvas follows the in-progress
                  node. Generated files live in <Code>/public/renders</Code> and
                  are served via <Code>/api/file/*</Code> — necessary because{" "}
                  <Code>next start</Code> won&apos;t serve files created after
                  boot.
                </p>
              </Prose>
            </section>

            {/* Replit */}
            <section id="replit" className="mt-14 scroll-mt-24">
              <SectionHeading
                eyebrow="Replit Partner Track"
                title="Running on Replit"
                lede="The whole app deploys on Replit — imported and brought up through Replit Agent, hosted on a replit.app domain."
              />
              <Prose>
                <p>
                  The repo ships root <Code>.replit</Code> + <Code>replit.nix</Code>{" "}
                  (Node 20 + ffmpeg) so the full Next app runs as a Repl. You{" "}
                  <b>import it through Replit Agent</b> — that Agent-driven setup
                  is the Partner Track&apos;s &ldquo;built using Replit
                  Agent&rdquo; step — then deploy on a <b>Reserved VM</b> for a{" "}
                  <Code>replit.app</Code> URL (Reserved VM keeps a persistent
                  filesystem for the rendered media that <Code>/api/file/*</Code>{" "}
                  serves back).
                </p>
                <p>
                  Running in the Repl, <Code>EXECUTION_MODE=local</Code> runs{" "}
                  <b>FFmpeg inside the Repl</b> — media processing happens on
                  Replit&apos;s platform, no separate service needed. (The
                  optional <Code>deploy/replit-executor</Code> is only for the
                  split setup: app elsewhere, FFmpeg offloaded to Replit over
                  HTTP.) The <Code>GEMINI_API_KEY</Code> lives in Replit{" "}
                  <b>Secrets</b>; at runtime CineDAG doesn&apos;t call a Replit AI
                  agent. Full walkthrough:{" "}
                  <a
                    href={`${GITHUB_URL}/blob/main/docs/REPLIT_DEPLOY.md`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    docs/REPLIT_DEPLOY.md
                  </a>
                  .
                </p>
              </Prose>
            </section>

            {/* Multimodal */}
            <section id="multimodal" className="mt-14 scroll-mt-24">
              <SectionHeading eyebrow="Gemini" title="Multimodal operations" />
              <div className="mt-5 space-y-3">
                {[
                  {
                    icon: Captions,
                    title: "Transcription + translation",
                    body: "A Gemini agent takes the extracted audio and returns timed segments translated per language, written as .srt — burned back in by FFmpeg.",
                  },
                  {
                    icon: Film,
                    title: "Smart vertical reframe",
                    body: "Gemini analyzes the clip for the subject's horizontal position; FFmpeg crops a subject-centered 9:16 window (center-crop fallback with no key).",
                  },
                  {
                    icon: Upload,
                    title: "Load a source three ways",
                    body: "A bundled sample clip, a pasted URL (fetched server-side, never through the browser), or an upload — both capped by MAX_UPLOAD_MB.",
                  },
                  {
                    icon: FileVideo,
                    title: "Preview + edit results",
                    body: "Resource nodes open a docked Results pane: a video player for video nodes, an editable subtitle view (load → edit → save) for subtitle nodes.",
                  },
                ].map((r) => (
                  <div
                    key={r.title}
                    className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                      <r.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {r.title}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {r.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Tech stack */}
            <section id="stack" className="mt-14 scroll-mt-24">
              <SectionHeading eyebrow="Stack" title="Tech stack" />
              <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {[
                  ["Next.js (App Router)", "UI + API routes, one deployable app"],
                  ["React Flow + dagre", "the pipeline canvas + auto-layout"],
                  ["Google ADK + Gemini", "the build + run-time agents"],
                  ["FFmpeg", "the deterministic media engine"],
                  ["Replit", "cloud executor for FFmpeg (Partner Track)"],
                  ["Tailwind CSS", "styling, light + dark"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <dt className="w-48 shrink-0 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {k}
                    </dt>
                    <dd className="text-sm text-slate-500 dark:text-slate-400">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow transition-transform hover:scale-[1.02]"
                >
                  <Workflow className="h-4 w-4" /> Launch the app{" "}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Sparkles className="h-4 w-4" /> Source on GitHub
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
