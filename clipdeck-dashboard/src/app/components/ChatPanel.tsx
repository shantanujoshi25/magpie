"use client";

import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { useState } from "react";

const SUGGESTIONS = [
  "Snippets per notebook as a bar chart",
  "What types of notes do I have?",
  "Show my capture activity over time",
];

export default function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [doc, setDoc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setDoc(json.doc || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ask Magpie");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="analytics-section">
      <div className="section-heading" style={{ marginBottom: 20 }}>
        Ask Magpie
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
          placeholder="Ask about your notes — Magpie builds the answer…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--border, #333)",
            background: "var(--card, #1a1a1a)",
            color: "inherit",
            fontSize: 14,
          }}
        />
        <button
          onClick={() => ask(question)}
          disabled={loading}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: loading ? "#444" : "var(--accent, #6c5ce7)",
            color: "#fff",
            cursor: loading ? "default" : "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            disabled={loading}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              border: "1px solid var(--border, #333)",
              background: "transparent",
              color: "inherit",
              cursor: loading ? "default" : "pointer",
              fontSize: 12,
              opacity: 0.85,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="loading" style={{ color: "#e06c75" }}>{error}</div>}

      {doc && (
        <div className="magpie-answer">
          <Renderer response={doc} library={openuiLibrary} isStreaming={false} />
        </div>
      )}
    </div>
  );
}
