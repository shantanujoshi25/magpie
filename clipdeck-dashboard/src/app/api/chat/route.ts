import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/clickhouse";
import { askGuildAgent } from "@/lib/guild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatMessage {
  role: string;
  content: string;
}

/** Build the smallest deterministic OpenUI doc that always renders. */
function fallbackDoc(text: string): string {
  const safe = text.replace(/"/g, "'").replace(/\n/g, " ").trim().slice(0, 500);
  return [
    "root = Stack([msg])",
    `msg = TextContent("${safe}", "default")`,
  ].join("\n");
}

/** Trim prose/fences so the doc starts at `root =`. Returns null if no root. */
function repairDoc(raw: string): string | null {
  let s = raw.trim();
  const fence = s.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const idx = s.indexOf("root =");
  if (idx === -1) return null;
  return s.slice(idx).trim();
}

export async function POST(req: NextRequest) {
  const client = getClient();
  try {
    const { messages } = (await req.json()) as { messages?: ChatMessage[] };
    const question =
      [...(messages ?? [])].reverse().find((m) => m.role === "user")?.content ??
      "";
    if (!question.trim()) {
      return NextResponse.json({ doc: fallbackDoc("Ask a question about your notes.") });
    }

    // Gather compact context from ClickHouse.
    const [nbRes, topicRes, recentRes] = await Promise.all([
      client.query({
        query: `SELECT notebook, count() AS n FROM clipboard_events
                GROUP BY notebook ORDER BY n DESC`,
        format: "JSONEachRow",
      }),
      client.query({
        query: `SELECT snippet_type, count() AS n FROM clipboard_events
                GROUP BY snippet_type ORDER BY n DESC`,
        format: "JSONEachRow",
      }),
      client.query({
        query: `SELECT notebook, snippet_type, substring(snippet, 1, 200) AS snippet
                FROM clipboard_events ORDER BY captured_at DESC LIMIT 40`,
        format: "JSONEachRow",
      }),
    ]);

    const context = {
      notebooks: await nbRes.json(),
      topics: await topicRes.json(),
      recent: await recentRes.json(),
    };

    const prompt =
      `QUESTION: ${question}\n\nCONTEXT: ${JSON.stringify(context)}`;

    let doc: string;
    try {
      const reply = await askGuildAgent("magpie-chat", prompt, { timeoutMs: 45000 });
      doc = repairDoc(reply) ?? fallbackDoc(reply);
    } catch (e) {
      doc = fallbackDoc(
        e instanceof Error ? `Magpie error: ${e.message}` : "Magpie is unavailable."
      );
    }

    return NextResponse.json({ doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ doc: fallbackDoc(message) }, { status: 200 });
  } finally {
    await client.close();
  }
}
