import { readFile } from "node:fs/promises";
import path from "node:path";
import { LlmAgent, InMemoryRunner } from "@google/adk";
import { geminiModelParam, hasApiKey } from "./dagBuilder";
import { runToText } from "./adkRun";

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

/** Language names / codes → 2-letter code, so we can read the language out of
 *  varied model-chosen filenames (english.srt, chinese.srt, subtitle-zh.srt…). */
const LANG_ALIASES: Record<string, string> = {
  english: "en", eng: "en", en: "en",
  chinese: "zh", mandarin: "zh", zh: "zh", zho: "zh", cn: "zh", zhcn: "zh", zhhans: "zh",
  spanish: "es", esp: "es", es: "es", spa: "es",
  french: "fr", francais: "fr", fr: "fr", fra: "fr",
  german: "de", deutsch: "de", ger: "de", deu: "de", de: "de",
  japanese: "ja", jpn: "ja", ja: "ja", jp: "ja",
  korean: "ko", kor: "ko", ko: "ko",
};

/**
 * Transcribe an audio file with Gemini (via the ADK) and translate each segment
 * into the requested languages. Throws if no API key is configured.
 */
export async function transcribeAudio(
  absAudioPath: string,
  langs: string[],
): Promise<SubSegment[]> {
  if (!hasApiKey()) throw new Error("no Gemini API key configured");

  const ext = path.extname(absAudioPath).toLowerCase();
  const mimeType = MIME[ext] ?? "audio/wav";
  const bytes = await readFile(absAudioPath);
  const wanted = langs.length ? langs : ["en"];

  const agent = new LlmAgent({
    name: "subtitle_transcriber",
    model: geminiModelParam(),
    description: "Transcribes speech from audio and translates it.",
    // Function form so the ADK skips {var} state-injection (JSON braces below).
    instruction: () => `You transcribe speech from an audio clip into timed subtitle segments and translate each segment.
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
      // Off: thinking can eat the output budget and return an empty transcript.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const runner = new InMemoryRunner({
    agent,
    appName: "video-pipeline-agent",
  });

  const raw = await runToText(runner, "transcriber", {
    role: "user",
    parts: [
      { text: `Transcribe and translate this audio into: ${wanted.join(", ")}.` },
      { inlineData: { mimeType, data: bytes.toString("base64") } },
    ],
  });
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

/**
 * Translate an existing SRT's cues into the requested languages (used when the
 * model splits transcription and translation into separate ops — a "translator"
 * gemini op that takes a subtitle in and emits a translated subtitle). Keeps the
 * original timing; returns SubSegments with `tr` filled per language.
 */
export async function translateSrt(
  srtContent: string,
  langs: string[],
): Promise<SubSegment[]> {
  if (!hasApiKey()) throw new Error("no Gemini API key configured");
  const cues = parseSrt(srtContent);
  if (!cues.length) return [];
  const wanted = langs.length ? langs : ["en"];

  const agent = new LlmAgent({
    name: "subtitle_translator",
    model: geminiModelParam(),
    description: "Translates subtitle cues into target languages.",
    instruction: () => `You translate subtitle lines into other languages.
Return JSON ONLY in this exact shape:
{ "segments": [ { "i": <cue index>, "translations": { ${wanted
      .map((l) => `"${l}": "<${languageName(l)} translation>"`)
      .join(", ")} } } ] }
Rules:
- One entry per input cue, same index (i) and order.
- "translations" MUST contain every requested code: ${wanted.join(", ")}. If a cue is already in that language, repeat it.
- Keep each translation concise (subtitle length).
- Output ONLY the JSON object.`,
    generateContentConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const runner = new InMemoryRunner({ agent, appName: "video-pipeline-agent" });
  const raw = await runToText(runner, "translator", {
    role: "user",
    parts: [
      {
        text:
          `Translate these subtitle lines into: ${wanted.join(", ")}.\n` +
          cues.map((c, i) => `${i}: ${c.text}`).join("\n"),
      },
    ],
  });
  if (!raw) throw new Error("translation returned empty");
  const parsed = JSON.parse(unwrap(raw)) as {
    segments?: Array<{ i?: number; translations?: Record<string, string> }>;
  };
  const byI = new Map(
    (parsed.segments ?? []).map((s) => [Number(s.i), s.translations ?? {}]),
  );
  return cues.map((c, i) => ({
    start: c.start,
    end: c.end,
    text: c.text,
    tr: byI.get(i) ?? {},
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

/**
 * Merge parallel SRTs (same timing, e.g. English + Chinese of the same audio)
 * into ONE multi-line SRT so the languages render as adjacent lines of a single
 * subtitle block. Lines stack top-to-bottom in the given order; timing comes
 * from whichever track has the cue.
 */
export function mergeSrt(contents: string[]): string {
  const tracks = contents.map(parseSrt).filter((t) => t.length);
  if (tracks.length <= 1) return contents[0] ?? "";
  const n = Math.max(...tracks.map((t) => t.length));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const timed = tracks.find((t) => t[i])?.[i];
    if (!timed) continue;
    const text = tracks
      .map((t) => t[i]?.text)
      .filter(Boolean)
      .join("\n");
    if (!text) continue;
    out.push(
      `${out.length + 1}\n${srtTime(timed.start)} --> ${srtTime(timed.end)}\n${text}\n`,
    );
  }
  return out.join("\n");
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

/**
 * Infer a language code from a subtitle filename. Handles the strict
 * `subs.en.srt` convention AND looser, model-chosen names like `english.srt`,
 * `chinese.srt`, `subtitle_zh.srt` — the model doesn't reliably use `.xx.srt`.
 * Defaults to "en".
 */
export function langFromFilename(filename: string): string {
  const base = filename.toLowerCase().replace(/\.(srt|vtt)$/i, "");
  // Strict trailing 2-letter code first (e.g. subs.en / subs.zh).
  const code = base.match(/[._-]([a-z]{2})$/);
  if (code && LANG_ALIASES[code[1]]) return LANG_ALIASES[code[1]];
  // Otherwise scan tokens for any known language name or code.
  for (const tok of base.split(/[^a-z]+/)) {
    if (LANG_ALIASES[tok]) return LANG_ALIASES[tok];
  }
  return "en";
}

/** Parse an SRT string into timed cues. */
export function parseSrt(
  content: string,
): Array<{ start: number; end: number; text: string }> {
  const toS = (h: string, m: string, s: string, ms: string) =>
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  const out: Array<{ start: number; end: number; text: string }> = [];
  for (const block of content.replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti === -1) continue;
    const m = lines[ti].match(
      /(\d\d):(\d\d):(\d\d)[,.](\d\d\d)\s*-->\s*(\d\d):(\d\d):(\d\d)[,.](\d\d\d)/,
    );
    if (!m) continue;
    const text = lines.slice(ti + 1).join("\n").trim();
    if (text) {
      out.push({
        start: toS(m[1], m[2], m[3], m[4]),
        end: toS(m[5], m[6], m[7], m[8]),
        text,
      });
    }
  }
  return out;
}

function unwrap(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  return a !== -1 && b > a ? raw.slice(a, b + 1) : raw;
}
