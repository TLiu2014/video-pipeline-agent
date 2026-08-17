import { LlmAgent, InMemoryRunner } from "@google/adk";
import type { GeneratedDag } from "@/lib/types";
import { DAG_BUILDER_INSTRUCTION } from "./systemPrompt";

/** True when a Gemini/Google API key is available to the ADK. */
export function hasApiKey(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

/** Lazily build the DAG-builder LlmAgent (one per process is fine). */
let cachedAgent: LlmAgent | null = null;
function getAgent(): LlmAgent {
  if (cachedAgent) return cachedAgent;
  cachedAgent = new LlmAgent({
    name: "video_dag_builder",
    model: geminiModel(),
    description:
      "Plans a strictly-alternating Resource/Operation video-processing DAG from a natural-language request.",
    instruction: DAG_BUILDER_INSTRUCTION,
    // Force raw JSON out of the model; we parse it ourselves. No tools are used,
    // so a JSON response mime type is safe here.
    generateContentConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });
  return cachedAgent;
}

/** Pull all model text out of an ADK event stream. */
async function collectText(
  runner: InMemoryRunner,
  prompt: string,
): Promise<string> {
  let text = "";
  for await (const event of runner.runEphemeral({
    userId: "builder",
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const parts = event.content?.parts ?? [];
    for (const p of parts) {
      if (typeof p.text === "string") text += p.text;
    }
  }
  return text.trim();
}

/** Strip ```json fences if the model wraps its output despite instructions. */
function unwrapJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first)
    return raw.slice(first, last + 1);
  return raw;
}

function validateDag(obj: unknown): GeneratedDag {
  if (!obj || typeof obj !== "object") throw new Error("model returned non-object");
  const dag = obj as Partial<GeneratedDag>;
  if (!Array.isArray(dag.nodes) || dag.nodes.length === 0)
    throw new Error("model returned no nodes");
  if (!Array.isArray(dag.edges)) throw new Error("model returned no edges");
  return {
    title: String(dag.title ?? "Generated Pipeline"),
    summary: String(dag.summary ?? ""),
    nodes: dag.nodes,
    edges: dag.edges,
  };
}

/**
 * Run the ADK builder agent on a user prompt and return a validated DAG.
 * Throws if the model is unavailable or returns unparseable output — the caller
 * (API route) decides whether to fall back to the canned sample.
 */
export async function generateDag(prompt: string): Promise<GeneratedDag> {
  const agent = getAgent();
  const runner = new InMemoryRunner({ agent, appName: "video-pipeline-agent" });
  const raw = await collectText(runner, prompt);
  if (!raw) throw new Error("model returned empty response");
  const parsed = JSON.parse(unwrapJson(raw));
  return validateDag(parsed);
}
