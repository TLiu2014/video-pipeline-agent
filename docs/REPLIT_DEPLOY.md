# Deploying CineDAG on Replit (Partner Track eligibility)

The Replit Partner Track has **two hard requirements**:

1. **Built using Replit Agent** — _"your project must be built using Replit Agent
   as part of the development process."_
2. **Deployed on Replit** — _"the finished project must be hosted and deployed
   directly on Replit (a project URL on a `replit.app` or `replit.dev` domain).
   Projects not deployed on Replit's platform will not meet this requirement,
   regardless of how the code was written."_

This repo already ships the config that makes both achievable (`.replit`,
`replit.nix`, `pnpm start:replit`). The one thing that **must be done by you, in
Replit** — it can't be scripted from a local machine — is the Agent step below.

---

## 1. Import the repo *through Replit Agent* — this is the "built using Agent" step

On https://replit.com → **Create App → Import from GitHub**, or start an
**Agent** session and prompt it with something like:

> Import `github.com/TLiu2014/video-pipeline-agent`, install dependencies with
> pnpm, and get the Next.js app running. It needs Node 20 and ffmpeg (both are
> declared in `replit.nix`). Run command is `pnpm start:replit` after
> `pnpm build`.

Let Replit Agent do the setup — resolve the run command, install deps, and fix
anything that breaks on first boot. **That Agent-driven import _is_ the required
development step.** Keep the Agent session / the commits it makes as evidence.

To strengthen the claim, make at least one real change through Agent (e.g. ask
it to _"add a `/api/health` route that returns 200 OK"_ or tweak a label) so
there's a genuine Agent contribution in the app's history — not just the import.

## 2. Add Secrets

In the Repl → **Tools → Secrets**, add:

| Key              | Value                                    |
| ---------------- | ---------------------------------------- |
| `GOOGLE_API_KEY` | your AI Studio key (aistudio.google.com) |
| `GEMINI_MODEL`   | `gemini-3.5-flash` (optional; default)   |

`EXECUTION_MODE=local`, `NEXT_TELEMETRY_DISABLED=1`, and `FFMPEG_PATH=ffmpeg` are
already set in `.replit [env]`. **Do not** put the API key in `.replit` — it's
committed to the repo; Secrets are not.

Because `EXECUTION_MODE=local`, FFmpeg runs **inside the Repl** (from
`replit.nix`), so all media processing happens on Replit's platform. You do
**not** need the separate `deploy/replit-executor` for this deployment — that
executor only exists for the split setup (app elsewhere, FFmpeg on Replit).

## 3. Run → you get a `*.replit.dev` URL

Press **Run**. The dev webview URL is a `*.replit.dev` domain — already valid for
the domain requirement while iterating.

## 4. Deploy → you get a `*.replit.app` URL

Open **Deploy** and choose **Reserved VM** (the `.replit [deployment]` block is
preconfigured for `gce`). Reserved VM matters here: CineDAG writes rendered
media to the local filesystem and serves it back via `/api/file/*`, so a
stateless **Autoscale** deployment would lose files between requests.

Deploy → you get the required **`*.replit.app`** production URL. Put that URL in
your Devpost submission.

> Reserved VM deployments consume Replit credits — request codes via the
> hackathon's Replit resources page before deploying.

---

## Checklist

- [ ] Repo imported **and run via Replit Agent** (Agent session/commits kept)
- [ ] At least one genuine change made through Agent
- [ ] `GOOGLE_API_KEY` set in Secrets
- [ ] App runs on `*.replit.dev` (dev) — prompt → build → run works end to end
- [ ] Deployed on **Reserved VM** → `*.replit.app` URL
- [ ] `*.replit.app` URL submitted on Devpost
