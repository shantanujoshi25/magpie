import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/clickhouse";
import { askGuildAgent } from "@/lib/guild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SNIPPETS = 80;
const MAX_SNIPPET_CHARS = 500;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ notebook: string }> }
) {
  const { notebook: raw } = await params;
  const notebook = decodeURIComponent(raw);
  const client = getClient();

  try {
    const res = await client.query({
      query: `SELECT snippet, snippet_type, captured_at
              FROM clipboard_events
              WHERE notebook = {nb:String}
              ORDER BY captured_at ASC
              LIMIT {lim:UInt32}`,
      query_params: { nb: notebook, lim: MAX_SNIPPETS },
      format: "JSONEachRow",
    });
    const rows = await res.json<{
      snippet: string;
      snippet_type: string;
      captured_at: string;
    }>();

    if (rows.length === 0) {
      return NextResponse.json({ notebook, summary: "", count: 0 });
    }

    const list = rows
      .map(
        (r, i) =>
          `${i + 1}. [${r.snippet_type}] ${r.snippet.slice(0, MAX_SNIPPET_CHARS)}`
      )
      .join("\n");

    const prompt = `Notebook: "${notebook}"\n\nSnippets (chronological):\n${list}`;

    const summary = await askGuildAgent("magpie-summarizer", prompt, {
      timeoutMs: 45000,
    });

    return NextResponse.json({ notebook, summary, count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}
