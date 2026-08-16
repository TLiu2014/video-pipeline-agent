/** Prompt suggestions surfaced in the side panel. */
export interface PromptTemplate {
  label: string;
  prompt: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    label: "Bilingual subtitles",
    prompt:
      "Subtitle this video in English and Simplified Chinese simultaneously, then burn both tracks into the frame.",
  },
  {
    label: "Dub to Chinese",
    prompt:
      "Transcribe the audio, translate it to Simplified Chinese, generate a natural Chinese voice-over, and replace the original audio track.",
  },
  {
    label: "Vertical for Reels",
    prompt:
      "Crop this landscape video to a 9:16 vertical aspect ratio for Instagram Reels and add auto-captions.",
  },
  {
    label: "Highlight reel",
    prompt:
      "Find the most engaging 30 seconds, trim to it, add a subtle zoom, and export a 1080x1080 square clip for social.",
  },
];
