import type { Metadata } from "next";
import DocsPage from "@/components/site/DocsPage";

export const metadata: Metadata = {
  title: "CineDAG · Docs — architecture & how it works",
  description:
    "How CineDAG works: the ADK + Gemini pipeline builder, the FFmpeg/Replit execution engine, and the multimodal operations — with an architecture diagram.",
};

export default function Docs() {
  return <DocsPage />;
}
