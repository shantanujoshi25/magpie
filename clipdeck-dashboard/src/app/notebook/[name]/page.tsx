"use client";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/styles/index.css";

import Link from "next/link";
import { use, useEffect, useState } from "react";

interface Snippet {
  event_id: string;
  captured_at: string;
  snippet: string;
  snippet_type: string;
  source_window: string;
  tokens: string;
  latency_ms: string;
}

interface NotebookData {
  notebook: string;
  snippets: Snippet[];
  types: { snippet_type: string; n: string }[];
}

const TYPE_CLASS: Record<string, string> = {
  definition: "definition",
  formula: "formula",
  example: "example",
  quote: "quote",
  image: "image",
};

function formatTime(clickhouseTs: string): string {
  const d = new Date(clickhouseTs.replace(" ", "T") + "Z");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function NotebookPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const notebook = decodeURIComponent(name);

  const [data, setData] = useState<NotebookData | null>(null);
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/notebook/${encodeURIComponent(notebook)}`);
        if (!res.ok) return;
        const json: NotebookData = await res.json();
        setData(json);
        setPrevCount(json.snippets.length);
      } catch {
        // keep last state
      }
    }
    fetchData();
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, [notebook]);

  return (
    <div className="notebook-detail">
      {/* Back */}
      <Link href="/" className="back-link">
        ← All notebooks
      </Link>

      {/* Header */}
      <h1 className="detail-title">{notebook}</h1>
      <p className="detail-subtitle">
        {data
          ? `${data.snippets.length} snippets · live from ClickHouse · updates every 2s`
          : "Connecting…"}
      </p>

      {/* Type breakdown */}
      {data && data.types.length > 0 && (
        <div className="detail-stats">
          {data.types.map((t) => (
            <div key={t.snippet_type} className="stat-card" style={{ minWidth: 0, padding: "12px 18px" }}>
              <div className="stat-label">{t.snippet_type}</div>
              <div className="stat-value" style={{ fontSize: 28 }}>{t.n}</div>
            </div>
          ))}
        </div>
      )}

      {/* Snippet list */}
      {!data ? (
        <div className="loading">Fetching from ClickHouse…</div>
      ) : data.snippets.length === 0 ? (
        <div className="loading">No snippets yet.</div>
      ) : (
        <div className="snippet-list">
          {data.snippets.map((s, i) => (
            <div
              key={s.event_id}
              className={`snippet-card ${TYPE_CLASS[s.snippet_type] ?? ""}`}
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <div className="snippet-text">{s.snippet}</div>
              <div className="snippet-meta">
                <span className={`type-pill ${TYPE_CLASS[s.snippet_type] ?? "neutral"}`} style={{ fontSize: 10 }}>
                  {s.snippet_type}
                </span>
                <span className="snippet-source">{s.source_window}</span>
                <span className="snippet-tokens">{s.tokens} tokens</span>
                <span className="snippet-tokens">{formatTime(s.captured_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
