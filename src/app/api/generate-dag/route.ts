import { NextResponse } from "next/server";
import { generateDag, hasApiKey } from "@/lib/agent/dagBuilder";
import { apiKeyFromRequest, runWithApiKey } from "@/lib/agent/keyContext";
import { SAMPLE_DAG } from "@/lib/dag";
import type { GenerateDagResponse } from "@/lib/types";

// The ADK / @google/genai clients are Node-only (native + Cloud deps).
export const runtime = "nodejs";

/**
 * POST /api/generate-dag
 * Body: { prompt: string }
 * Returns a Resource/Operation DAG. Falls back to a canned sample pipeline when
 * no API key is set or the model errors, so the UI is always demoable.
 */
export async function POST(req: Request) {
  const clientKey = apiKeyFromRequest(req);
  let prompt = "";
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    /* empty / invalid body → treated as no prompt */
  }

  if (!prompt) {
    return NextResponse.json(
      { error: "Missing 'prompt' in request body." },
      { status: 400 },
    );
  }

  // Run under the BYOK context so hasApiKey()/generateDag() see the client key.
  return runWithApiKey(clientKey, () => handle(prompt));
}

async function handle(prompt: string) {
  if (!hasApiKey()) {
    const res: GenerateDagResponse = {
      dag: SAMPLE_DAG,
      fallback: true,
      note: "No Gemini API key configured — showing a sample pipeline. Add GEMINI_API_KEY to .env.local (or your key in Settings) to generate from your prompt.",
    };
    return NextResponse.json(res);
  }

  try {
    const dag = await generateDag(prompt);
    const res: GenerateDagResponse = { dag, fallback: false };
    return NextResponse.json(res);
  } catch (err) {
    console.error("[generate-dag] model error:", err);
    const res: GenerateDagResponse = {
      dag: SAMPLE_DAG,
      fallback: true,
      note: `Generation failed (${
        err instanceof Error ? err.message : "unknown error"
      }) — showing a sample pipeline.`,
    };
    return NextResponse.json(res);
  }
}
