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
