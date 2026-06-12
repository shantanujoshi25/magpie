"use client";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/styles/index.css";

import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildChartsDoc, type DashboardData } from "@/lib/buildDashboardDoc";

const TYPE_CLASS: Record<string, string> = {
  definition: "definition",
  formula: "formula",
  example: "example",
  quote: "quote",
  image: "image",
};

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartsDoc, setChartsDoc] = useState("");
  const [connected, setConnected] = useState(false);
  const prevDocRef = useRef("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/data");
        if (!res.ok) return;
        const json: DashboardData = await res.json();
        setData(json);
        setConnected(true);
        const doc = buildChartsDoc(json);
        if (doc !== prevDocRef.current) {
          prevDocRef.current = doc;
          setChartsDoc(doc);
        }
      } catch {
        // keep last state on blip
      }
    }
    fetchData();
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, []);

  const total = data?.notebooks.reduce((s, n) => s + parseInt(n.n), 0) ?? 0;
  const typeCount = data ? new Set(data.topics.map((t) => t.snippet_type)).size : 0;

  return (
    <div className="shell">
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-brand">
          <h1>Magpie</h1>
          <p>Ambient study tracker — copy anything, everything is captured</p>
        </div>
        {connected && (
          <div className="live-badge">
            <span className="live-dot" />
            Live · ClickHouse
          </div>
        )}
      </div>

      {/* Stats */}
      {data && (
        <div className="stats-row">
          {[
            { label: "Snippets Captured", value: total },
            { label: "Notebooks", value: data.notebooks.length },
            { label: "Snippet Types", value: typeCount },
          ].map(({ label, value }, i) => (
            <div key={label} className="stat-card" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Notebooks */}
      <div className="section-heading">Notebooks</div>

      {!data ? (
        <div className="loading">Connecting to ClickHouse…</div>
      ) : data.notebooks.length === 0 ? (
        <div className="loading">No snippets captured yet — start studying!</div>
      ) : (
        <div className="notebook-grid">
          {data.notebooks.map((nb) => {
            const types = data.topics.filter((t) => t.notebook === nb.notebook);
            return (
              <Link
                key={nb.notebook}
                href={`/notebook/${encodeURIComponent(nb.notebook)}`}
              >
                <div className="notebook-card">
                  <div className="notebook-card-header">
                    <div className="notebook-name">{nb.notebook}</div>
                    <span className="notebook-count">{nb.n} snippets →</span>
                  </div>
                  <div className="notebook-tags">
                    {types.map((t) => (
                      <span
                        key={t.snippet_type}
                        className={`type-pill ${TYPE_CLASS[t.snippet_type] ?? "neutral"}`}
                      >
                        {t.snippet_type} ×{t.n}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Analytics — OpenUI Renderer */}
      {chartsDoc && (
        <div className="analytics-section">
          <div className="section-heading" style={{ marginBottom: 20 }}>Analytics</div>
          <Renderer
            response={chartsDoc}
            library={openuiLibrary}
            isStreaming={false}
          />
        </div>
      )}
    </div>
  );
}
