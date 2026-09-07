import type { InMemoryRunner } from "@google/adk";

type EphemeralParams = Parameters<InMemoryRunner["runEphemeral"]>[0];
type EphemeralMessage = EphemeralParams["newMessage"];

/**
 * Drain an ADK event stream into the model's text output.
 *
 * The ADK reports model / API failures as error EVENTS (errorCode /
 * errorMessage) rather than throwing, and a run that stops short (SAFETY,
 * MAX_TOKENS, RECITATION) yields no content. Both otherwise look identical to a
 * plain empty response, so we surface the real reason instead of a bare
 * "empty response". Thought parts (thinking models) are not counted as answer
 * text.
 */
export async function runToText(
  runner: InMemoryRunner,
  userId: string,
  newMessage: EphemeralMessage,
): Promise<string> {
  const debug = Boolean(process.env.ADK_DEBUG);
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 120_000);

  const drain = async (): Promise<string> => {
  let text = "";
  let finishReason: string | undefined;
  let parts = 0;
  let thoughtParts = 0;

  for await (const event of runner.runEphemeral({ userId, newMessage })) {
    const e = event as {
      errorCode?: string;
      errorMessage?: string;
      finishReason?: string;
      partial?: boolean;
      usageMetadata?: unknown;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    };
    if (debug) {
      console.log("[adk]", {
        finishReason: e.finishReason,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        partial: e.partial,
        parts: (e.content?.parts ?? []).map((p) => ({
          thought: Boolean(p.thought),
          textLen: typeof p.text === "string" ? p.text.length : 0,
        })),
        usage: e.usageMetadata,
      });
    }
    if (e.errorMessage || e.errorCode) {
      throw new Error(e.errorMessage || `Gemini error (${e.errorCode})`);
    }
    if (e.finishReason) finishReason = e.finishReason;
    for (const p of e.content?.parts ?? []) {
      parts++;
      if (p.thought) {
        thoughtParts++;
        continue;
      }
      if (typeof p.text === "string") text += p.text;
    }
  }

  text = text.trim();
  if (!text) {
    const fr = finishReason ?? "unknown";
    // A thinking model that returned only reasoning (no answer) is the common
    // cause — point the user at a fix instead of a bare "empty response".
    const hint =
      parts > 0 && thoughtParts === parts
        ? " — model returned only reasoning; set GEMINI_MODEL to a non-thinking model (e.g. gemini-2.5-flash)"
        : "";
    throw new Error(`model returned no text (finishReason: ${fr})${hint}`);
  }
  return text;
  };

  // Race the drain against a timeout so a hung request surfaces a clear error
  // and releases the node instead of leaving it stuck "running" forever.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s`),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([drain(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
