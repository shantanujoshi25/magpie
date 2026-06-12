# Magpie

**Ambient study tracker — copy anything, everything is captured, classified, and visualized.**

Magpie watches your clipboard while you study. Every snippet you copy is
classified into a topic "notebook" by a [Guild.ai](https://guild.ai) agent and
streamed into ClickHouse, where a live dashboard turns it into notebooks,
charts, summaries, and an AI assistant that builds its own UI.

---

## Architecture

```
                 copy text
                     │
          ┌──────────▼───────────┐         ┌────────────────────┐
          │   magpie-watcher     │  text   │   Guild agents      │
          │  (Python, clipboard) ├────────▶│  classify / chat /  │
          │  async worker queue  │  JSON   │  summarize / refile │
          └──────────┬───────────┘◀────────┴────────────────────┘
                     │ insert row
              ┌──────▼───────┐
              │  ClickHouse  │  clipboard_events
              └──────┬───────┘
                     │ query / mutate
          ┌──────────▼───────────┐
          │  magpie dashboard    │  Next.js + OpenUI
          │  notebooks · charts  │
          │  summaries · chat    │
          └──────────────────────┘
```

Everything intelligent runs through **Guild agents** (one platform); the
dashboard renders rich UI via **OpenUI**.

---

## Components

| Directory | What it is |
|-----------|-----------|
| `magpie-watcher/` | Python clipboard watcher. Polls the clipboard, hands each new copy to a background worker queue (non-blocking — clip as fast as you like), calls the classifier agent, and inserts a row into ClickHouse. |
| `magpie-agent/` | Guild `llmAgent` that classifies a snippet → `{notebook, snippet_type, key_insight, tokens_estimated}`. |
| `magpie-summarizer/` | Guild agent that synthesizes all snippets in a notebook into a connected narrative. |
| `magpie-refiler/` | Guild agent that assigns a "Misc" snippet to the best-fitting existing notebook. |
| `magpie-chat/` | Guild agent that answers questions by emitting an **OpenUI Lang** document the dashboard renders as charts/cards/tags. |
| `clipdeck-dashboard/` | Next.js dashboard. Live notebooks + analytics, per-notebook summaries, one-click "Clean up Misc", and an "Ask Magpie" panel. |
| `clickhouse/` | Table schema + seed data. |

### ClickHouse schema

```sql
CREATE TABLE clipboard_events (
    event_id      UUID DEFAULT generateUUIDv4(),
    captured_at   DateTime64(3) DEFAULT now64(3),
    snippet       String,
    snippet_type  LowCardinality(String),
    notebook      LowCardinality(String),
    source_window String,
    tokens        UInt32,
    latency_ms    UInt32
)
ENGINE = MergeTree()
ORDER BY (captured_at, event_id);
```

---

## Running it

### Prerequisites
- Guild CLI authed: `npm i -g @guildai/cli && guild auth login`
- A ClickHouse Cloud instance with the schema above
- Python 3.12+ and Node 20+

### 1. The watcher (capture → classify → store)

```bash
cd magpie-watcher
python3 -m venv .venv && source .venv/bin/activate
pip install pyperclip clickhouse-connect pygetwindow python-dotenv pyobjc-framework-Cocoa
# create .env with CLICKHOUSE_* and GUILD_AGENT_ID=shanjoshi25~magpie-agent
python watcher.py
```

Copy text anywhere — rows land in ClickHouse within a few seconds.

### 2. The dashboard

```bash
cd clipdeck-dashboard
npm install
cp .env.example .env   # fill CLICKHOUSE_* and GUILD_TOKEN (from `guild auth token`)
npm run dev            # http://localhost:3000
```

---

## Guild agents

All four are published and installed in the `magpie` workspace:

| Agent | Purpose |
|-------|---------|
| `shanjoshi25~magpie-agent` | classify snippet → notebook |
| `shanjoshi25~magpie-summarizer` | summarize a notebook |
| `shanjoshi25~magpie-refiler` | re-file Misc snippets |
| `shanjoshi25~magpie-chat` | answer questions as OpenUI |

The dashboard calls them over the Guild HTTP API (`src/lib/guild.ts`):
create a session → poll events → read the reply. To re-publish an agent after
editing its `agent.ts`:

```bash
cd magpie-<name>
guild agent save --message "..." --publish --wait
guild workspace agent add shanjoshi25~magpie-<name>
```

---

## How the dashboard talks to Guild

`clipdeck-dashboard/src/lib/guild.ts` exposes `askGuildAgent(name, prompt)` —
it gets a bearer token (`GUILD_TOKEN` env or `guild auth token`), POSTs a chat
session, polls `/api/sessions/{id}/events` for the agent's reply, and returns
the text. `parseAgentJson()` tolerates the agent occasionally dropping
underscores in JSON keys.

The three feature routes:
- `GET /api/summarize/[notebook]` → narrative summary
- `POST /api/refile` → moves Misc snippets (guarded `ALTER TABLE … UPDATE`)
- `POST /api/chat` → returns an OpenUI Lang doc rendered by `<Renderer>`

---

## Notes

- The `magpie-*` agent directories are each their own Guild git repo (with a
  Guild remote) **and** have their source tracked here — edit `agent.ts`, then
  `guild agent save` to publish.
- `.env` files are gitignored; copy from `.env.example` and fill in secrets.
