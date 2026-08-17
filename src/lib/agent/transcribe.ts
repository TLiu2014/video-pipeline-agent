import { readFile } from "node:fs/promises";
import path from "node:path";
import { LlmAgent, InMemoryRunner } from "@google/adk";
import { geminiModel, hasApiKey } from "./dagBuilder";

export interface SubSegment {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Original transcript for this segment. */
  text: string;
  /** Translations keyed by language code (e.g. { en, zh }). */
  tr: Record<string, string>;
}

const MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

const LANG_NAME: Record<string, string> = {
  en: "English",
  zh: "Simplified Chinese",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
};

export function languageName(code: string): string {
  return LANG_NAME[code] ?? code;
}

/**
 * Transcribe an audio file with Gemini (via the ADK) and translate each segment
 * into the requested languages. Throws if no API key is configured.
 */
export async function transcribeAudio(
  absAudioPath: string,
  langs: string[],
): Promise<SubSegment[]> {
  if (!hasApiKey()) throw new Error("no GOOGLE_API_KEY configured");

  const ext = path.extname(absAudioPath).toLowerCase();
  const mimeType = MIME[ext] ?? "audio/wav";
  const bytes = await readFile(absAudioPath);
  const wanted = langs.length ? langs : ["en"];

  const agent = new LlmAgent({
    name: "subtitle_transcriber",
    model: geminiModel(),
    description: "Transcribes speech from audio and translates it.",
    instruction: `You transcribe speech from an audio clip into timed subtitle segments and translate each segment.
Return JSON ONLY in this exact shape:
{ "segments": [ { "start": <seconds>, "end": <seconds>, "text": "<original transcript>", "translations": { ${wanted
      .map((l) => `"${l}": "<${languageName(l)} translation>"`)
      .join(", ")} } } ] }
Rules:
- Keep each segment to one short sentence / clause (~2-6 seconds).
- start/end are numeric seconds (floats) relative to the clip start; they must be increasing and non-overlapping.
- "text" is the verbatim transcript in the original language.
- "translations" MUST contain every requested language code: ${wanted.join(", ")}. If the original is already in that language, repeat it.
- If there is no discernible speech, return { "segments": [] }.
- Output ONLY the JSON object.`,
    generateContentConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const runner = new InMemoryRunner({
    agent,
    appName: "video-pipeline-agent",
  });

  let raw = "";
  for await (const event of runner.runEphemeral({
    userId: "transcriber",
    newMessage: {
      role: "user",
      parts: [
        { text: `Transcribe and translate this audio into: ${wanted.join(", ")}.` },
        { inlineData: { mimeType, data: bytes.toString("base64") } },
      ],
    },
  })) {
    for (const p of event.content?.parts ?? []) {
      if (typeof p.text === "string") raw += p.text;
    }
  }

  raw = raw.trim();
  if (!raw) throw new Error("transcription returned empty");
  const parsed = JSON.parse(unwrap(raw)) as {
    segments?: Array<{
      start?: number;
      end?: number;
      text?: string;
      translations?: Record<string, string>;
    }>;
  };
  const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
  return segments.map((s, i) => ({
    start: Number(s.start ?? i * 3),
    end: Number(s.end ?? i * 3 + 3),
    text: String(s.text ?? ""),
    tr: s.translations ?? {},
  }));
}

/** Render subtitle segments to an SRT string for a given language. */
export function toSrt(segments: SubSegment[], lang: string): string {
  return segments
    .map((s, i) => {
      const line = s.tr[lang] ?? s.text;
      return `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${line}\n`;
    })
    .join("\n");
}

function srtTime(sec: number): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/** Infer a language code from a subtitle filename like "subs.en.srt". */
export function langFromFilename(filename: string): string {
  const m = filename.match(/\.([a-z]{2})\.(srt|vtt)$/i);
  return m ? m[1].toLowerCase() : "en";
}

function unwrap(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  return a !== -1 && b > a ? raw.slice(a, b + 1) : raw;
}
