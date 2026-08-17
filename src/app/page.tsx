import { Builder } from "@/components/pipeline/Builder";

// Read the server-configured engine settings and hand them to the client shell.
export default function Page() {
  const executionMode =
    process.env.EXECUTION_MODE === "replit" ? "replit" : "local";
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 100);
  return (
    <Builder
      executionMode={executionMode}
      model={model}
      maxUploadMb={maxUploadMb}
    />
  );
}
