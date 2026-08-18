// Agentic Cinema — Replit FFmpeg executor
//
// A tiny sandboxed FFmpeg runner the main app calls over HTTP in
// EXECUTION_MODE=replit. It only runs `ffmpeg` commands inside a working dir,
// gated by a shared bearer token. See docs/REPLIT_SETUP.md.

import express from "express";
import multer from "multer";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const execAsync = promisify(exec);
const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.EXECUTOR_TOKEN || "";
const WORKDIR = path.resolve(process.env.WORKDIR || "./work");
if (!existsSync(WORKDIR)) mkdirSync(WORKDIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// Confine a caller-supplied name to a basename inside WORKDIR.
function safePath(name) {
  const base = path.basename(String(name || "")).replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
  if (!base || base.startsWith("..")) return null;
  return path.join(WORKDIR, base);
}

// Bearer-token auth on every route.
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!TOKEN) return res.status(500).json({ error: "EXECUTOR_TOKEN not set" });
  const auth = req.get("authorization") || "";
  if (auth !== `Bearer ${TOKEN}`)
    return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// POST /exec { command } — run an ffmpeg command in WORKDIR.
app.post("/exec", async (req, res) => {
  const command = String(req.body?.command || "").trim();
  if (!command) return res.status(400).json({ error: "missing command" });
  // Only allow ffmpeg — this is a media runner, not a general shell.
  if (!/^ffmpeg(\s|$)/.test(command))
    return res.status(400).json({ error: "only ffmpeg commands are allowed" });
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: WORKDIR,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    res.json({ ok: true, code: 0, stdout, stderr });
  } catch (err) {
    res.json({
      ok: false,
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
    });
  }
});

// POST /upload (multipart: field "path" + file "file") — write into WORKDIR.
app.post("/upload", upload.single("file"), async (req, res) => {
  const dest = safePath(req.body?.path || req.file?.originalname);
  if (!dest || !req.file)
    return res.status(400).json({ error: "missing path/file" });
  await writeFile(dest, req.file.buffer);
  res.json({ ok: true, path: path.basename(dest) });
});

// GET /download/:name — stream a file back.
app.get("/download/:name", (req, res) => {
  const p = safePath(req.params.name);
  if (!p || !existsSync(p)) return res.status(404).json({ error: "not found" });
  res.sendFile(p);
});

// GET /exists/:name — { exists }.
app.get("/exists/:name", (req, res) => {
  const p = safePath(req.params.name);
  res.json({ exists: Boolean(p && existsSync(p)) });
});

app.listen(PORT, () => {
  console.log(`[executor] listening on :${PORT}, workdir ${WORKDIR}`);
});
