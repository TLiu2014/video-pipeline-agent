import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Node status palette — mirrors the real-time execution states shared
        // by the canvas nodes, edges and legend.
        status: {
          idle: "#8b5cf6", // ⚪ violet   — not run yet
          running: "#f59e0b", // 🟡 amber  — operation executing
          done: "#10b981", // 🟢 green    — media produced
          failed: "#ef4444", // 🔴 red     — FFmpeg / agent error
          queued: "#3b82f6", // 🔵 blue    — waiting on upstream
        },
      },
    },
  },
  plugins: [],
};

export default config;
