import { createClient } from "@clickhouse/client";
import { NextRequest, NextResponse } from "next/server";

function getClient() {
  return createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: "default",
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const notebook = decodeURIComponent(name);
  const client = getClient();

  try {
    const [snippetsRes, typesRes] = await Promise.all([
      client.query({
        query: `SELECT event_id, captured_at, snippet, snippet_type, source_window, tokens, latency_ms
                FROM clipboard_events
                WHERE notebook = {nb:String}
                ORDER BY captured_at DESC`,
        query_params: { nb: notebook },
        format: "JSONEachRow",
      }),
      client.query({
        query: `SELECT snippet_type, count() AS n
                FROM clipboard_events
                WHERE notebook = {nb:String}
                GROUP BY snippet_type ORDER BY n DESC`,
        query_params: { nb: notebook },
        format: "JSONEachRow",
      }),
    ]);

    const [snippets, types] = await Promise.all([
      snippetsRes.json<{
        event_id: string;
        captured_at: string;
        snippet: string;
        snippet_type: string;
        source_window: string;
        tokens: string;
        latency_ms: string;
      }>(),
      typesRes.json<{ snippet_type: string; n: string }>(),
    ]);

    return NextResponse.json({ notebook, snippets, types });
  } finally {
    await client.close();
  }
}
