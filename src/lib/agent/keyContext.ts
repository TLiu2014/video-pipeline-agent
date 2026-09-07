import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request BYOK context. A browser can send its own Gemini key with each
 * request (header `x-gemini-key`); we stash it here so the ADK agents deep in
 * the execution path can read it without threading a param through every
 * function + both executor classes. AsyncLocalStorage keeps it request-scoped
 * and concurrency-safe (unlike mutating process.env).
 */
const store = new AsyncLocalStorage<{ apiKey?: string }>();

/** Run `fn` with the request's BYOK Gemini key (if any) in scope. */
export function runWithApiKey<T>(apiKey: string | undefined, fn: () => T): T {
  return store.run({ apiKey: apiKey?.trim() || undefined }, fn);
}

/** The client-provided (BYOK) key for the current request, if any. */
export function clientApiKey(): string | undefined {
  return store.getStore()?.apiKey;
}

/** Pull the BYOK key off a request's headers. */
export function apiKeyFromRequest(req: Request): string | undefined {
  return req.headers.get("x-gemini-key")?.trim() || undefined;
}

/* ------------------------------------------------------------------ */
/* Backend selection: BYOK → Vertex AI (ADC) → server key → none.     */
/* (pattern shared with ConsultingDAG's src/lib/apiKey.ts)            */
/* ------------------------------------------------------------------ */

/** How to construct the Gemini / genai client. Spread straight into the ctor. */
export type ModelConfig =
  | { vertexai: false; apiKey: string }
  | { vertexai: true; project: string; location: string };

/** Basic BYOK sanity check before we trust a client-supplied key. */
export function looksLikeApiKey(k?: string): boolean {
  return !!k && /^[A-Za-z0-9_-]{20,80}$/.test(k.trim());
}

/** Server env Gemini key (AI Studio). Accepts either accepted name. */
function envApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

/** Whether Vertex AI is enabled + has a project (ADC-based, no key). */
function vertexConfig(): { project: string; location: string } | null {
  if (
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" &&
    process.env.GOOGLE_CLOUD_PROJECT
  ) {
    return {
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    };
  }
  return null;
}

/**
 * Resolve the Gemini backend for the current request, in priority order:
 *   1. a valid BYOK key (this request)                → AI Studio with that key,
 *   2. GOOGLE_GENAI_USE_VERTEXAI=true + GCP project    → Vertex AI via ADC (no key),
 *   3. a server GEMINI_API_KEY / GOOGLE_API_KEY        → AI Studio,
 *   4. otherwise null                                  → not configured.
 */
export function resolveModelConfig(): ModelConfig | null {
  const byok = clientApiKey();
  if (looksLikeApiKey(byok)) return { vertexai: false, apiKey: byok!.trim() };
  const vertex = vertexConfig();
  if (vertex) return { vertexai: true, ...vertex };
  const key = envApiKey();
  if (key) return { vertexai: false, apiKey: key };
  return null;
}

/** Can we reach Gemini at all (via any backend)? */
export function isConfigured(): boolean {
  return resolveModelConfig() !== null;
}

/** Backend the SERVER would use with no BYOK override (Vertex wins over key). */
export function serverBackend(): "vertex" | "aistudio" | null {
  if (vertexConfig()) return "vertex";
  return envApiKey() ? "aistudio" : null;
}
