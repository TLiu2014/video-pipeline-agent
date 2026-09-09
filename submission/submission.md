# CineDAG — Submission

**Live app:** https://cinedag.replit.app/ · **Demo video:** https://youtu.be/tg5KCGneYFc

## Inspiration

Editing a video for social — subtitles, a bilingual translation, a vertical reframe for Reels — is a small task that still means wrestling with a timeline editor or memorizing FFmpeg incantations. The *intent* is one sentence ("add English and Chinese subtitles and burn them in"), but the *execution* is a dozen fiddly steps.

We kept seeing agent demos that generate a single blob of output and hoped it was right. Video is unforgiving: one wrong filter and you crop someone's head off, or the Chinese renders as tofu boxes. We wanted an agent you could **see think** — one that plans an explicit, inspectable pipeline before touching a single frame, so you can watch each step, check its output, and change it in plain English. That's CineDAG: describe the edit, and it builds and runs a multi-agent pipeline you can actually read.

## What it does

CineDAG turns a natural-language request into a **Resource/Operation DAG** — a graph that strictly alternates media artifacts and agent steps — then builds it live on a canvas and runs it for real.

- **Describe an edit** ("bilingual subtitles, burned in" / "make it a vertical 9:16 short with auto-captions"). Google's ADK + Gemini plan a pipeline node-by-node.
- **Watch it build** on a React Flow canvas: `Source → Audio Extractor → Audio → Transcriber → Subtitles → Subtitle Burner → Final`. Every step is a node you can inspect.
- **Run it** — FFmpeg does the deterministic media work; Gemini does the multimodal work (transcription, translation, content-preserving vertical reframe). Nodes light up as they execute.
- **Inspect every step** — open any node's output tab (e.g. the generated `.srt` with the exact English + Chinese lines), scrub the final video, and download it from the player menu.
- **Keep chatting to refine** — follow-up messages update the *same* pipeline in place instead of starting over.

It ships with sample flows (bilingual subtitle burn, vertical reframe + auto-captions) and runs the whole thing on Replit.

## How we built it

- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind, with **React Flow** (`@xyflow/react`) for the pipeline canvas and **dagre** for auto-layout. State is plain React around one Builder component; results stream to the UI over **SSE**.
- **Agent layer:** the **Google Agent Development Kit for TypeScript** (`@google/adk`) drives **Gemini** (`gemini-3.5-flash`). One `LlmAgent` returns a strict Resource/Operation JSON DAG; other Gemini calls handle transcription, translation, and reframe analysis.
- **Backend resolution:** a per-request priority chain — BYOK (browser-supplied key) → **Vertex AI** (ADC) → server env key → a canned sample fallback so the UI is always demoable.
- **Execution:** everything runs through one `ExecutorService` interface with two backends — `LocalFfmpegRunner` (child-process FFmpeg) and `ReplitCloudRunner` (remote HTTP). Operations carry an `engine` tag (`ffmpeg` / `gemini` / `tts`) that decides where they run. Swapping engines is one env var.
- **Media:** FFmpeg with **libass** burns subtitles; a blurred-background fit does content-preserving vertical reframes (nothing cropped). Outputs are written to disk and served back through a Range-aware `/api/file/*` route.
- **Deploy:** the full app runs on **Replit** with `EXECUTION_MODE=local`, so FFmpeg executes inside the Repl — build, run, and preview all live on one public URL. We imported and iterated on the project with **Replit Agent**.

## Challenges we ran into

- **The ADK's quiet contract.** A string `instruction` triggers `{var}` template injection — our prompts contain literal `{in}`/`{out}` braces, which blew up with "Context variable not found." Switching to a *function-form* instruction fixed it. And errors surface as **events** (`errorCode`/`finishReason`), not thrown exceptions, so "empty response" was really a masked error until we surfaced the event text.
- **Thinking models eating the budget.** On Gemini 2.5+/3.x, hidden reasoning consumed the output budget and returned empty JSON. Setting `thinkingConfig.thinkingBudget = 0` gave the whole budget back to the structured output we actually wanted.
- **A minifier that silently dropped a filter.** Next's SWC minifier mis-folded a template-literal FFmpeg filter and dropped a segment (`,gblur=...[bg];`) from the production bundle — a bug that only appeared in `next build`, not dev. We found it by grepping the compiled route and rewrote the filter as a single plain string.
- **Chinese rendered as tofu boxes on Replit.** The transcript was correct, but Replit's Nix container has no CJK font, so libass drew `.notdef` boxes. We installed `noto-fonts-cjk-sans` via `replit.nix` and forced the family through `force_style` (env-gated so local rendering is unchanged).
- **Legacy alignment quirks.** libass `force_style` uses *legacy SSA* alignment, not the ASS numpad — `Alignment=8` renders in the middle, not the top. We verified empirically and pinned `2`/`6`.
- **Replit deploy failing at Promote.** The deployment run command used `pnpm`, but `corepack` is only enabled in the build phase — so the run phase found no `pnpm`, opened no port, and failed the health check. Calling the `next` binary directly and binding `0.0.0.0:$PORT` fixed it.

## Accomplishments that we're proud of

- An agent whose plan is **visible and inspectable** — not a black box. You can read the graph, open any step's output, and trust the result.
- **Iterative refinement** — follow-up chat edits the existing pipeline in place instead of regenerating from scratch.
- A genuinely **pluggable execution engine** (local FFmpeg ↔ Replit cloud) behind one interface, swappable with a single env var.
- **Content-preserving vertical reframe** — fits the whole frame over a blurred background, so nothing gets cropped.
- It **always demos** — with no API key it falls back to a sample pipeline, so the UI never dead-ends.

## What we learned

- Read the library's *source*, not just its README — the ADK's function-vs-string instruction behavior and event-based errors weren't documented where we looked, and grepping `node_modules` beat guessing.
- Production-only bugs are real: the SWC minifier issue never showed in dev. Always test the actual `next build`.
- Fonts and encodings are where "it works on my machine" goes to die — CJK glyphs, libass alignment, and the deploy container's font set all bit us.
- Making an agent's reasoning **structural** (an explicit DAG) rather than freeform text makes it dramatically easier to verify, debug, and edit.

## What's next for CineDAG

- **Real AI dubbing** — the `tts` engine is currently stubbed; wire up voice synthesis over the translated captions.
- **More operations** — highlight-reel extraction, B-roll insertion, background music, silence trimming.
- **Parallel execution** — the DAG already encodes independence; run non-dependent branches concurrently.
- **Shareable pipelines** — export/import already works as JSON; add a gallery of community pipelines as starting points.
- **Longer-form video** — chunked transcription and streaming renders for clips beyond a few minutes.
