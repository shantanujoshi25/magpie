import { NextResponse } from "next/server";
import { getClient } from "@/lib/clickhouse";
import { askGuildAgent, parseAgentJson } from "@/lib/guild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MISC = 30;
const MAX_SNIPPET_CHARS = 400;
const CONCURRENCY = 3;

interface MiscRow {
  event_id: string;
  snippet: string;
}

interface Change {
  event_id: string;
  from: "Misc";
  to: string;
}

export async function POST() {
  const client = getClient();
  try {
    // Candidate notebooks (everything except the catch-all).
    const candRes = await client.query({
      query: `SELECT DISTINCT notebook FROM clipboard_events WHERE notebook != 'Misc'`,
      format: "JSONEachRow",
    });
    const candidates = (await candRes.json<{ notebook: string }>()).map(
      (r) => r.notebook
    );
    if (candidates.length === 0) {
      return NextResponse.json({ moved: 0, changes: [], reason: "no candidate notebooks" });
    }

    // Misc snippets to re-file.
    const miscRes = await client.query({
      query: `SELECT event_id, snippet FROM clipboard_events
              WHERE notebook = 'Misc'
              ORDER BY captured_at DESC
              LIMIT {lim:UInt32}`,
      query_params: { lim: MAX_MISC },
      format: "JSONEachRow",
    });
    const misc = await miscRes.json<MiscRow>();
    if (misc.length === 0) {
      return NextResponse.json({ moved: 0, changes: [] });
    }

    const candidateSet = new Set(candidates);
    const changes: Change[] = [];

    // Classify each Misc row, bounded concurrency.
    async function classify(row: MiscRow): Promise<void> {
      const prompt =
        `EXISTING NOTEBOOKS: ${JSON.stringify(candidates)}\n` +
        `SNIPPET: ${row.snippet.slice(0, MAX_SNIPPET_CHARS)}`;
      let target: string;
      try {
        const reply = await askGuildAgent("magpie-refiler", prompt, {
          timeoutMs: 40000,
        });
        const parsed = parseAgentJson<{ notebook?: string }>(reply);
        target = (parsed.notebook ?? "Misc").trim();
      } catch {
        return; // skip on agent error; leave in Misc
      }
      // Guard: only accept a real existing notebook.
      if (target === "Misc" || !candidateSet.has(target)) return;

      await client.command({
        query: `ALTER TABLE clipboard_events UPDATE notebook = {nb:String}
                WHERE event_id = {id:String}`,
        query_params: { nb: target, id: row.event_id },
      });
      changes.push({ event_id: row.event_id, from: "Misc", to: target });
    }

    for (let i = 0; i < misc.length; i += CONCURRENCY) {
      await Promise.all(misc.slice(i, i + CONCURRENCY).map(classify));
    }

    return NextResponse.json({ moved: changes.length, changes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}
