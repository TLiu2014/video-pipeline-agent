# Running the pipeline on Replit (`EXECUTION_MODE=replit`)

In local mode the app runs FFmpeg on your machine. In **Replit mode** it offloads
every FFmpeg step to a small **executor service** you deploy on Replit, and pulls
the results back so previews still work in the browser.

```
Next app (your machine)                         Replit (cloud)
────────────────────────                        ──────────────
stage source ── upload ─────────────────────▶  work/raw.mp4
run "Audio Extractor" (ffmpeg) ── /exec ─────▶  ffmpeg … ▶ work/audio.wav
download audio.wav  ◀── /download ───────────
Gemini transcription  (runs LOCALLY, uses your GEMINI_API_KEY)
upload subs.en.srt ── /upload ──────────────▶  work/subs.en.srt
run "Subtitle Burner" (ffmpeg) ── /exec ─────▶  ffmpeg … ▶ work/subtitled.mp4
download subtitled.mp4 ◀── /download ─────────  (preview in the app)
```

> **Only FFmpeg runs on Replit.** Gemini calls (transcription, reframe analysis)
> run on your Next server, so `GEMINI_API_KEY` never leaves your machine.

The executor code is in [`deploy/replit-executor/`](../deploy/replit-executor).

---

## 1. Create the executor Repl

1. Go to <https://replit.com> and **Create Repl** → **Import from GitHub**, or
   **Create Repl → Node.js** and copy in the four files from
   `deploy/replit-executor/`:
   - `server.js`
   - `package.json`
   - `replit.nix`  (adds `ffmpeg` + `nodejs` to the Repl)
   - `.replit`     (run command + exposes the web port)

   If you imported the whole `video-pipeline-agent` repo instead, set the Repl's
   **root/run dir** to `deploy/replit-executor` (or copy those files to the root).

2. Confirm `replit.nix` includes `pkgs.ffmpeg`. Inside the Repl shell, verify:

   ```bash
   ffmpeg -version   # should print a version, not "command not found"
   ```

## 2. Set the shared secret

1. In the Repl, open **Tools → Secrets** and add:

   | Key             | Value                                   |
   | --------------- | --------------------------------------- |
   | `EXECUTOR_TOKEN`| a long random string you invent         |

   Generate one locally if you like:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Click **Run**. On first run Replit installs `express` + `multer` and starts
   the server. You should see `[executor] listening on :3000` in the console.

## 3. Get the public URL

Replit gives the Repl a public URL like
`https://<repl-name>.<your-username>.repl.co` (or a `*.replit.dev` URL from the
webview). Copy it. Test it from your machine:

```bash
curl https://YOUR-REPL-URL/health
# → {"ok":true}
```

## 4. Point the app at it

In the main app's `.env.local`:

```bash
EXECUTION_MODE=replit
REPLIT_EXECUTOR_URL=https://YOUR-REPL-URL
REPLIT_EXECUTOR_TOKEN=the-same-EXECUTOR_TOKEN-value

# Gemini still runs locally — keep this set for real subtitles / smart reframe:
GEMINI_API_KEY=your-key
```

Restart the app (`pnpm dev` or `pnpm build && pnpm start`). The side panel's
engine badge now reads **Replit Cloud**.

## 5. Run a pipeline

Load a source clip, press **Run Pipeline**. In the trace you'll see FFmpeg steps
logged as `[replit] $ ffmpeg …` (executed on the Repl) while Gemini steps run
locally. Produced videos/subtitles download back and preview in the Results tab.

Both sample flows work end-to-end:
- **Bilingual Subtitle Burner** — extract + burn run on Replit; transcription is
  local Gemini.
- **Speaker-Tracked Vertical Reframe** — reframe crop runs on Replit; the smart
  crop plan comes from local Gemini (falls back to a center crop with no key).

---

## Testing the executor locally (optional)

You don't need Replit to try this path — run the executor on your own machine:

```bash
# terminal 1 — the executor
cd deploy/replit-executor && npm install
EXECUTOR_TOKEN=testtoken WORKDIR=/tmp/executor-work PORT=4100 npm start

# terminal 2 — the app in replit mode, pointed at localhost
EXECUTION_MODE=replit \
REPLIT_EXECUTOR_URL=http://localhost:4100 \
REPLIT_EXECUTOR_TOKEN=testtoken \
pnpm dev
```

## Endpoints (for reference)

All require `Authorization: Bearer $EXECUTOR_TOKEN` except `/health`.

| Method | Path               | Purpose                                  |
| ------ | ------------------ | ---------------------------------------- |
| GET    | `/health`          | liveness check (no auth)                 |
| POST   | `/exec`            | `{ command }` — run an `ffmpeg` command  |
| POST   | `/upload`          | multipart `path` + `file` → write to work dir |
| GET    | `/download/:name`  | stream a file back                       |
| GET    | `/exists/:name`    | `{ exists }`                             |

`/exec` only accepts commands starting with `ffmpeg`, and file names are confined
to the executor's work dir.

## Troubleshooting

- **`Replit executor not configured`** in the trace → `REPLIT_EXECUTOR_URL` /
  `REPLIT_EXECUTOR_TOKEN` aren't set (or the app wasn't restarted after setting).
- **401 unauthorized** → the app's `REPLIT_EXECUTOR_TOKEN` ≠ the Repl's
  `EXECUTOR_TOKEN`.
- **`only ffmpeg commands are allowed`** → expected; the executor is FFmpeg-only.
- **`command not found: ffmpeg`** on the Repl → `ffmpeg` missing from
  `replit.nix`; add `pkgs.ffmpeg` and restart the Repl.
- **Repl sleeps** (free tier) → the first request after idle may be slow while it
  wakes; retry, or keep it warm with an Autoscale/Reserved deployment.
