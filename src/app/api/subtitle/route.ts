import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { fromPublicUrl } from "@/lib/media";

export const runtime = "nodejs";

const isSubtitle = (url: string) => /\.(srt|vtt)$/i.test(url);

/** GET /api/subtitle?url=/renders/subs.en.srt → { content } */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isSubtitle(url)) {
    return NextResponse.json({ error: "Not a subtitle URL." }, { status: 400 });
  }
  const abs = fromPublicUrl(url);
  if (!abs) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  try {
    const content = await readFile(abs, "utf8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

/** POST /api/subtitle { url, content } → overwrite the subtitle file. */
export async function POST(req: Request) {
  let url = "";
  let content = "";
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url : "";
    content = typeof body?.content === "string" ? body.content : "";
  } catch {
    /* handled below */
  }
  if (!isSubtitle(url)) {
    return NextResponse.json({ error: "Not a subtitle URL." }, { status: 400 });
  }
  const abs = fromPublicUrl(url);
  if (!abs) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  try {
    await writeFile(abs, content, "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Write failed." },
      { status: 500 },
    );
  }
}
