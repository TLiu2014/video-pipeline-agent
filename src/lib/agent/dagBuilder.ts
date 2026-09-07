import { LlmAgent, InMemoryRunner, Gemini } from "@google/adk";
import type { GeneratedDag } from "@/lib/types";
import { DAG_BUILDER_INSTRUCTION } from "./systemPrompt";
import { isConfigured, resolveModelConfig } from "./keyContext";
import { runToText } from "./adkRun";

/**
 * True when Gemini is reachable via ANY backend, in priority order:
 * BYOK (this request) → Vertex AI (ADC) → server GEMINI_API_KEY/GOOGLE_API_KEY.
 * See resolveModelConfig() in keyContext.ts.
 */
export function hasApiKey(): boolean {
  return isConfigured();
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

/**
 * The `model` to hand an LlmAgent. Bind an explicit Gemini instance to the
 * resolved backend — a BYOK/env key (AI Studio) or Vertex AI (ADC, no key) —
 * by spreading the ModelConfig into the ctor. Falls back to the model-name
 * string only when nothing is configured (callers gate on hasApiKey() first).
 */
export function geminiModelParam(): string | Gemini {
  const cfg = resolveModelConfig();
  return cfg ? new Gemini({ model: geminiModel(), ...cfg }) : geminiModel();
}

/** Build the DAG-builder LlmAgent (per call — the resolved key can vary). */
function getAgent(): LlmAgent {
  return new LlmAgent({
    name: "video_dag_builder",
    model: geminiModelParam(),
    description:
      "Plans a strictly-alternating Resource/Operation video-processing DAG from a natural-language request.",
    // Function form (not string) so the ADK does NOT run {var} state-injection
    // templating — our instruction contains literal braces ({in}/{out}, JSON).
    instruction: () => DAG_BUILDER_INSTRUCTION,
    // Force raw JSON out of the model; we parse it ourselves. No tools are used,
    // so a JSON response mime type is safe here.
    generateContentConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
      // Disable "thinking": these are structured-extraction tasks that don't
      // need chain-of-thought, and on thinking models (gemini-2.5+/3.x) the
      // hidden reasoning can consume the output budget and return an empty
      // answer. Off = the whole budget goes to the JSON we actually want.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
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
 * When `current` is provided, the request is treated as a REFINEMENT of the
 * existing pipeline (the follow-up chat updates it in place) rather than a
 * fresh build. Throws if the model is unavailable or returns unparseable output.
 */
export async function generateDag(
  prompt: string,
  current?: GeneratedDag,
): Promise<GeneratedDag> {
  const agent = getAgent();
  const runner = new InMemoryRunner({ agent, appName: "video-pipeline-agent" });
  const text = current
    ? `You are UPDATING an existing pipeline, not starting over. Here is the current pipeline JSON:
\`\`\`json
${JSON.stringify({
  title: current.title,
  summary: current.summary,
  nodes: current.nodes,
  edges: current.edges,
})}
\`\`\`

Apply this change from the user and return the FULL updated pipeline JSON. Keep the parts that still apply, reuse existing node ids where a node is unchanged, and only add / remove / modify nodes and edges as the change requires. Change request: ${prompt}`
    : prompt;
  const raw = await runToText(runner, "builder", {
    role: "user",
    parts: [{ text }],
  });
  if (!raw) throw new Error("model returned empty response");
  const parsed = JSON.parse(unwrapJson(raw));
  return validateDag(parsed);
}
