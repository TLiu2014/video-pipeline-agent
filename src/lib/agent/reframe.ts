import { readFile } from "node:fs/promises";
import path from "node:path";
import { LlmAgent, InMemoryRunner } from "@google/adk";
import { geminiModel, hasApiKey } from "./dagBuilder";

export interface CropPlan {
  /** Horizontal center of the subject, 0 (far left) … 1 (far right). */
  focalX: number;
  /** Short human explanation from the model. */
  reason?: string;
}

const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

/** Cap inline video payload; Gemini inline data has a hard limit. */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

/**
 * Ask Gemini (via the ADK) where the main subject sits horizontally, so the
 * reframe step can crop a 9:16 window that keeps the subject centered instead
 * of blindly cropping the middle. Throws if no key / video too large.
 */
export async function analyzeReframe(absVideoPath: string): Promise<CropPlan> {
  if (!hasApiKey()) throw new Error("no GOOGLE_API_KEY configured");
  const bytes = await readFile(absVideoPath);
  if (bytes.length > MAX_INLINE_BYTES) {
    throw new Error(
      `video too large for inline analysis (${Math.round(
        bytes.length / (1024 * 1024),
      )}MB > 18MB)`,
    );
  }
  const mimeType = VIDEO_MIME[path.extname(absVideoPath).toLowerCase()] ??
    "video/mp4";

  const agent = new LlmAgent({
    name: "reframe_analyzer",
    model: geminiModel(),
    description: "Finds the main subject's horizontal position for reframing.",
    instruction: `You are reframing a 16:9 video into a 9:16 vertical short. Watch the clip and locate the MAIN SUBJECT (the speaker / person / focal action).
Return JSON ONLY:
{ "focalX": <number 0..1>, "reason": "<short>" }
- focalX is the subject's horizontal center across the clip: 0 = far left, 0.5 = centered, 1 = far right.
- If the subject moves, give the average position.
- If there is no clear subject, return 0.5.
Output ONLY the JSON object.`,
    generateContentConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const runner = new InMemoryRunner({ agent, appName: "video-pipeline-agent" });
  let raw = "";
  for await (const event of runner.runEphemeral({
    userId: "reframer",
    newMessage: {
      role: "user",
      parts: [
        { text: "Where is the main subject horizontally? Reframe to 9:16." },
        { inlineData: { mimeType, data: bytes.toString("base64") } },
      ],
    },
  })) {
    for (const p of event.content?.parts ?? []) {
      if (typeof p.text === "string") raw += p.text;
    }
  }

  raw = raw.trim();
  if (!raw) throw new Error("reframe analysis returned empty");
  const parsed = JSON.parse(unwrap(raw)) as Partial<CropPlan>;
  let focalX = Number(parsed.focalX);
  if (!Number.isFinite(focalX)) focalX = 0.5;
  focalX = Math.min(1, Math.max(0, focalX));
  return { focalX, reason: parsed.reason };
}

function unwrap(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  return a !== -1 && b > a ? raw.slice(a, b + 1) : raw;
}
