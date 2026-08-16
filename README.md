# 🎬 Agentic Cinema — Multimodal Video Pipeline Builder

> **Agentic Cinema Hackathon · Replit Partner Track**

Describe a video workflow in plain English and a **Gemini-powered multi-agent
pipeline** builds and runs it — AI dubbing, bilingual subtitle burning,
social-media aspect-ratio crops, highlight reels, and more.

Powered by the **Google Agent Development Kit (ADK) for TypeScript**
(`@google/adk`) + Gemini, with a pluggable execution engine that runs FFmpeg
**locally** for fast dev or offloads scripts to a **Replit cloud workspace** in
production.

---

## How it works

```
Prompt ──▶ ADK builder agent (Gemini) ──▶ Resource/Operation DAG ──▶ Executor
"Subtitle in EN + ZH"                     (React Flow canvas)        (FFmpeg / Replit)
```

The generated graph **strictly alternates** between two node families:

| Node          | Meaning                        | Examples                                   |
| ------------- | ------------------------------ | ------------------------------------------ |
| **Resource**  | a concrete media artifact      | `raw.mp4`, `audio.wav`, `subs.en.srt`      |
| **Operation** | an ADK agent / tool that runs  | `Audio Extractor`, `Transcriber`, `Burner` |

Every path looks like `resource → operation → resource → operation → …`.

## Tech stack

- **Next.js** (App Router, Node runtime) · **React 19** · **Tailwind CSS**
- **React Flow** (`@xyflow/react`) for the pipeline canvas
- **Google ADK** (`@google/adk`) driving **Gemini** for DAG generation
- **FFmpeg** (`child_process`) locally · **Replit API** adapter for the cloud

## Getting started

```bash
pnpm install
cp .env.example .env.local     # add your GOOGLE_API_KEY (from aistudio.google.com/apikey)
pnpm dev                       # http://localhost:3000
```

> No API key? The app still runs — `/api/generate-dag` returns a canned sample
> pipeline so the UI is always demoable.

FFmpeg must be on your `PATH` (or set `FFMPEG_PATH`) for local execution.

## Configuration (`.env.local`)

| Var                        | Default            | Purpose                                             |
| -------------------------- | ------------------ | --------------------------------------------------- |
| `GOOGLE_API_KEY`           | —                  | Gemini key used by the ADK (`GEMINI_API_KEY` works) |
| `GOOGLE_GENAI_USE_VERTEXAI`| `false`            | Use the AI Studio Developer API, not Vertex         |
| `GEMINI_MODEL`             | `gemini-2.5-flash` | Model backing the DAG-builder agent                 |
| `EXECUTION_MODE`           | `local`            | `local` (FFmpeg here) or `replit` (cloud)           |
| `MEDIA_DIR`                | `./public/media`   | Where source media / rendered outputs live          |
| `FFMPEG_PATH`              | `ffmpeg`           | FFmpeg binary path                                  |
| `REPLIT_API_TOKEN`         | —                  | Required only when `EXECUTION_MODE=replit`          |

## Project layout

```
sample/                            # demo pipeline flows as JSON (subtitle, reframe)
src/
  app/
    page.tsx                       # server shell → <Builder>
    api/generate-dag/route.ts      # ADK + Gemini → Resource/Operation JSON (+ fallback)
    api/execute/route.ts           # topo-sorts the DAG → runs via ExecutorService
  components/
    theme/                         # ThemeProvider + toggle (ported)
    pipeline/
      Header.tsx                   # prompt bar + template chips + settings + theme
      SettingsMenu.tsx             # gear dropdown (appearance / engine / about)
      Builder.tsx                  # client state: generate + run + status
      PipelineCanvas.tsx           # React Flow canvas + legend
      VideoNode.tsx                # Resource + Operation node renderers
  lib/
    agent/                         # ADK LlmAgent + system prompt (DAG builder)
    execution/                     # ExecutorService: LocalFfmpegRunner + ReplitCloudRunner
    dag.ts                         # dagre layout, hydration, loads /sample/*.json
    types.ts                       # shared Resource/Operation contract
```

## The execution abstraction

Everything runs through one interface (`src/lib/execution/types.ts`):

```ts
interface ExecutorService {
  readonly mode: "local" | "replit";
  runOperation(spec: OperationSpec): Promise<OperationResult>;
  runPipeline(specs: OperationSpec[]): Promise<OperationResult[]>;
}
```

- **`LocalFfmpegRunner`** — executes `ffmpeg` operations via `child_process` in
  `MEDIA_DIR`; `gemini`/`tts` operations resolve as *skipped* (wire in the model
  calls there).
- **`ReplitCloudRunner`** — provisions a workspace, pushes the FFmpeg scripts,
  runs them remotely, and returns the artifacts. Network calls are stubbed with
  clear TODOs so the Replit API can be dropped in without touching the UI.

Swap engines by setting `EXECUTION_MODE` — no code changes.

## Scripts

```bash
pnpm dev        # dev server
pnpm build      # production build
pnpm start      # serve the production build
pnpm typecheck  # tsc --noEmit
```
