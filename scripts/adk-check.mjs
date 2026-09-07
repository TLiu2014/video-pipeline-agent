// Standalone probe: calls Gemini through @google/adk exactly like the app does,
// and dumps every event so we can see WHY a run comes back empty.
//
// Run from the repo root with your key:
//   GEMINI_API_KEY=your-key node scripts/adk-check.mjs
// (GOOGLE_API_KEY / GOOGLE_GENAI_API_KEY also accepted.)

import { LlmAgent, InMemoryRunner, Gemini } from "@google/adk";

const key =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!key) {
  console.error("No key. Run: GEMINI_API_KEY=your-key node scripts/adk-check.mjs");
  process.exit(1);
}

const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
console.log("model:", model, "| key length:", key.length, "\n");

async function run(label, config) {
  console.log(`\n════ ${label} ════`);
  const agent = new LlmAgent({
    name: "diag",
    model: new Gemini({ model, apiKey: key }),
    instruction: () => "You return small JSON objects when asked.",
    generateContentConfig: config,
  });
  const runner = new InMemoryRunner({ agent, appName: "diag" });
  let i = 0;
  let gotText = "";
  try {
    for await (const ev of runner.runEphemeral({
      userId: "u",
      newMessage: { role: "user", parts: [{ text: 'Return JSON {"ok":true,"n":3}' }] },
    })) {
      const parts = (ev.content?.parts ?? []).map((p) => ({
        thought: Boolean(p.thought),
        textLen: typeof p.text === "string" ? p.text.length : 0,
        keys: Object.keys(p),
      }));
      for (const p of ev.content?.parts ?? [])
        if (!p.thought && typeof p.text === "string") gotText += p.text;
      console.log(
        `  event ${i++}:`,
        JSON.stringify({
          finishReason: ev.finishReason,
          errorCode: ev.errorCode,
          errorMessage: ev.errorMessage,
          partial: ev.partial,
          parts,
          usage: ev.usageMetadata,
        }),
      );
    }
    console.log("  → collected text:", JSON.stringify(gotText.trim().slice(0, 200)));
  } catch (err) {
    console.error("  → threw:", err?.message || err);
  }
}

await run("A) responseMimeType application/json (what the app uses)", {
  responseMimeType: "application/json",
  temperature: 0.4,
});
await run("B) plain text (no responseMimeType)", { temperature: 0.4 });
await run("C) json + thinkingBudget 0 (thinking disabled)", {
  responseMimeType: "application/json",
  temperature: 0.4,
  thinkingConfig: { thinkingBudget: 0 },
});

process.exit(0);
