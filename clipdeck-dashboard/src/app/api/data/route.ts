import { createClient } from "@clickhouse/client";
import { NextResponse } from "next/server";

function getClient() {
  return createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: "default",
  });
}

export async function GET() {
  const client = getClient();
  try {
    const [notebooksRes, timelineRes, topicRes, recentRes] = await Promise.all([
      client.query({
        query: `SELECT notebook, count() AS n
                FROM clipboard_events
                GROUP BY notebook ORDER BY n DESC`,
        format: "JSONEachRow",
      }),
      client.query({
        query: `SELECT toStartOfMinute(captured_at) AS minute, count() AS n
                FROM clipboard_events
                GROUP BY minute ORDER BY minute`,
        format: "JSONEachRow",
      }),
      client.query({
        query: `SELECT notebook, snippet_type, count() AS n
                FROM clipboard_events
                GROUP BY notebook, snippet_type ORDER BY notebook`,
        format: "JSONEachRow",
      }),
      client.query({
        query: `SELECT event_id, captured_at, snippet, snippet_type, notebook, tokens
                FROM clipboard_events
                ORDER BY captured_at DESC LIMIT 50`,
        format: "JSONEachRow",
      }),
    ]);

    const [notebooks, timeline, topics, recent] = await Promise.all([
      notebooksRes.json<{ notebook: string; n: string }>(),
      timelineRes.json<{ minute: string; n: string }>(),
      topicRes.json<{ notebook: string; snippet_type: string; n: string }>(),
      recentRes.json<{
        event_id: string;
        captured_at: string;
        snippet: string;
        snippet_type: string;
        notebook: string;
        tokens: string;
      }>(),
    ]);

    return NextResponse.json({ notebooks, timeline, topics, recent });
  } finally {
    await client.close();
  }
}
