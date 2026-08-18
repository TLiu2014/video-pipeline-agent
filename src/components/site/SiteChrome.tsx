"use client";

import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CineDagTile } from "@/components/brand/CineDagMark";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/TLiu2014/video-pipeline-agent";

/** CineDAG wordmark: brand tile + name (matches the app header). */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <CineDagTile size={30} />
      <span className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
        Cine<span className="text-indigo-500">DAG</span>
      </span>
    </span>
  );
}

/** Shared top nav for the landing + docs pages. */
export function SiteNav({ active }: { active?: "home" | "docs" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" aria-label="CineDAG home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            title="View the source on GitHub"
            aria-label="View the source on GitHub"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Github className="h-4 w-4" />
          </a>
          <Link
            href={active === "docs" ? "/" : "/docs"}
            className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:inline-flex"
          >
            {active === "docs" ? "Home" : "Docs"}
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition-transform hover:scale-[1.02]"
          >
            Launch app
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-xs text-slate-400 dark:text-slate-600">
      <span className="font-medium text-slate-500 dark:text-slate-500">
        CineDAG
      </span>{" "}
      — built for the{" "}
      <a
        href="https://agentic-cinema.devpost.com/"
        target="_blank"
        rel="noreferrer"
        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600 dark:decoration-slate-700 dark:hover:text-slate-300"
      >
        Agentic Cinema hackathon
      </a>{" "}
      (Replit Partner Track). Open source · repo{" "}
      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] dark:bg-slate-800">
        video-pipeline-agent
      </code>
      .
    </footer>
  );
}

/** Small uppercase eyebrow above a section heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
      {children}
    </div>
  );
}

/** Section heading block: eyebrow + title + optional lede. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
        {title}
      </h2>
      {lede && (
        <p className="mt-3 leading-relaxed text-slate-500 dark:text-slate-400">
          {lede}
        </p>
      )}
    </div>
  );
}
