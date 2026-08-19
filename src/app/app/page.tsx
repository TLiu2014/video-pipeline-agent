import type { Metadata } from "next";
import { Builder } from "@/components/pipeline/Builder";

export const metadata: Metadata = {
  title: "CineDAG — pipeline builder",
};

// The CineDAG tool itself lives at /app. Reads the server-configured engine
// settings and hands them to the client shell.
export default function AppPage() {
  const executionMode =
    process.env.EXECUTION_MODE === "replit" ? "replit" : "local";
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 100);
  const hasServerKey = Boolean(
    process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
  );
  return (
    <Builder
      executionMode={executionMode}
      model={model}
      maxUploadMb={maxUploadMb}
      hasServerKey={hasServerKey}
    />
  );
}
