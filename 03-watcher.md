# 03 — The Clipboard Watcher

**Goal:** a Python script that watches the clipboard, invokes the Guild agent for every new copy, and writes a row to ClickHouse. By the end of this file you've completed **integration point 1** with Track B.

**Time budget:** 90 minutes including thin-slice integration.

---

## What you're building

```
[clipboard poll]  ──►  [dedup]  ──►  [shell out: guild chat --once]  ──►  [parse JSON]  ──►  [insert row to ClickHouse]
```

Keep the watcher dumb. All reasoning is in the agent. The watcher only orchestrates.

---

## Step 1 — Create the watcher

In `magpie-watcher/`, create `watcher.py`:

```python
"""
Magpie watcher.

Polls the system clipboard, invokes the Guild agent on each new copy,
parses the agent's JSON response, and writes a row to ClickHouse.
"""

import json
import os
import re
import subprocess
import time
import uuid
from datetime import datetime

import clickhouse_connect
import pyperclip
from dotenv import load_dotenv

try:
    import pygetwindow as gw
except Exception:
    gw = None


load_dotenv()

CLICKHOUSE_HOST = os.environ["CLICKHOUSE_HOST"]
CLICKHOUSE_PORT = int(os.environ.get("CLICKHOUSE_PORT", "8443"))
CLICKHOUSE_USER = os.environ.get("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.environ["CLICKHOUSE_PASSWORD"]
CLICKHOUSE_DATABASE = os.environ.get("CLICKHOUSE_DATABASE", "default")
GUILD_AGENT_ID = os.environ.get("GUILD_AGENT_ID", "magpie-agent")

POLL_INTERVAL_SEC = 0.5
MIN_SNIPPET_CHARS = 5     # ignore tiny copies (single chars, accidental Ctrl+C)
MAX_SNIPPET_CHARS = 4000  # truncate very large clipboard contents


# ---------------------------------------------------------------------------
# ClickHouse client
# ---------------------------------------------------------------------------

ch = clickhouse_connect.get_client(
    host=CLICKHOUSE_HOST,
    port=CLICKHOUSE_PORT,
    username=CLICKHOUSE_USER,
    password=CLICKHOUSE_PASSWORD,
    database=CLICKHOUSE_DATABASE,
    secure=True,
)


# ---------------------------------------------------------------------------
# Active window title (best-effort, cross-platform)
# ---------------------------------------------------------------------------

def active_window_title() -> str:
    if gw is None:
        return ""
    try:
        win = gw.getActiveWindow()
        return (win.title if win else "") or ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Guild agent invocation
# ---------------------------------------------------------------------------

JSON_BLOCK = re.compile(r"\{[\s\S]*\}")


def call_guild_agent(snippet: str) -> dict:
    """
    Invoke the Guild agent over the CLI and return parsed JSON.
    Falls back to a 'Misc' classification on any failure so the
    watcher loop never crashes.
    """
    try:
        result = subprocess.run(
            ["guild", "chat", "--once", snippet, "--agent", GUILD_AGENT_ID],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return _fallback(snippet, reason="timeout")
    except FileNotFoundError:
        raise RuntimeError(
            "The 'guild' CLI was not found on PATH. "
            "Run `npm install -g @guildai/cli` and `guild auth login`."
        )

    if result.returncode != 0:
        print(f"[guild] non-zero exit: {result.stderr.strip()[:200]}")
        return _fallback(snippet, reason="nonzero-exit")

    stdout = result.stdout.strip()

    # The agent may emit prose around the JSON (a CLI banner, a trailing line,
    # etc.). Extract the first {...} block.
    match = JSON_BLOCK.search(stdout)
    if not match:
        print(f"[guild] no JSON in output: {stdout[:200]}")
        return _fallback(snippet, reason="no-json")

    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        print(f"[guild] bad JSON: {exc}; raw: {match.group(0)[:200]}")
        return _fallback(snippet, reason="bad-json")

    # Coerce and default fields the agent might omit.
    return {
        "notebook": str(data.get("notebook") or "Misc")[:60],
        "snippet_type": str(data.get("snippet_type") or "other")[:24],
        "key_insight": str(data.get("key_insight") or "")[:400],
        "tokens_estimated": int(data.get("tokens_estimated") or len(snippet) // 4),
    }


def _fallback(snippet: str, reason: str) -> dict:
    return {
        "notebook": "Misc",
        "snippet_type": "other",
        "key_insight": f"(unclassified: {reason})",
        "tokens_estimated": max(1, len(snippet) // 4),
    }


# ---------------------------------------------------------------------------
# ClickHouse insert
# ---------------------------------------------------------------------------

def insert_event(
    snippet: str,
    classification: dict,
    source_window: str,
    latency_ms: int,
) -> None:
    ch.insert(
        "clipboard_events",
        [[
            uuid.uuid4(),
            datetime.utcnow(),
            snippet,
            classification["snippet_type"],
            classification["notebook"],
            source_window,
            classification["tokens_estimated"],
            latency_ms,
        ]],
        column_names=[
            "event_id",
            "captured_at",
            "snippet",
            "snippet_type",
            "notebook",
            "source_window",
            "tokens",
            "latency_ms",
        ],
    )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"[magpie] watching clipboard. agent={GUILD_AGENT_ID}")
    last_seen = ""

    try:
        last_seen = pyperclip.paste() or ""
    except pyperclip.PyperclipException:
        last_seen = ""

    while True:
        try:
            current = pyperclip.paste() or ""
        except pyperclip.PyperclipException:
            current = ""

        if (
            current
            and current != last_seen
            and MIN_SNIPPET_CHARS <= len(current) <= 100_000
        ):
            last_seen = current
            snippet = current[:MAX_SNIPPET_CHARS]
            window = active_window_title()

            print(f"\n[clip] {len(snippet)} chars from {window!r}")
            print(f"[clip] preview: {snippet[:80]!r}")

            t0 = time.time()
            classification = call_guild_agent(snippet)
            latency_ms = int((time.time() - t0) * 1000)

            print(
                f"[agent] notebook={classification['notebook']!r} "
                f"type={classification['snippet_type']!r} "
                f"latency={latency_ms}ms"
            )

            try:
                insert_event(snippet, classification, window, latency_ms)
                print("[ch] inserted")
            except Exception as exc:
                print(f"[ch] insert failed: {exc}")

        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
```

---

## Step 2 — Thin-slice integration test

This is **integration point 1** with Track B. The goal: copy text, see a row land in ClickHouse, watch Track B's dashboard pick it up.

```bash
# In magpie-watcher/
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python watcher.py
```

Then in another window:

1. Copy any text from a webpage (anything 30+ characters).
2. The watcher should print: `[clip] ... [agent] notebook='...' [ch] inserted`.
3. Tell Track B to refresh their dashboard. They should see your row.

If all three steps happen, **integration point 1 is done**. Notify Track B in chat.

If something breaks, the error tells you which segment of the pipe failed:
- No `[clip]` line → clipboard polling problem (pyperclip permissions on macOS, X11 selection on Linux)
- `[guild] ...` errors → re-run `guild chat --once "..." --agent magpie-agent` by hand and see what it returns
- `[ch] insert failed` → re-run the connection test from `01-setup.md`

---

## Step 3 — Stress-test with realistic snippets

While the watcher is running, copy 8–10 different snippets across 3 topics. Verify in the watcher log:

- The same topic produces the same `notebook` name across snippets.
- Latency is sub-3-seconds per snippet. If it's 10s+ consistently, the agent prompt may be too long — trim it.
- No `_fallback` entries (or only on intentionally weird snippets).

If `notebook` names are inconsistent for the same topic, **strengthen the "reuse existing names" rule in the prompt** (file 02) and re-test. Topic consistency is what makes the dashboard look intelligent.

---

## Step 4 — Demo robustness

Before moving on, simulate the demo conditions:

```bash
# Run for 60 seconds, copy 5 things across 3 different topics
# Then check the rows directly:
```

Add a tiny inspection script `check_rows.py`:

```python
import os
import clickhouse_connect
from dotenv import load_dotenv

load_dotenv()

ch = clickhouse_connect.get_client(
    host=os.environ["CLICKHOUSE_HOST"],
    port=int(os.environ.get("CLICKHOUSE_PORT", "8443")),
    username=os.environ.get("CLICKHOUSE_USER", "default"),
    password=os.environ["CLICKHOUSE_PASSWORD"],
    database=os.environ.get("CLICKHOUSE_DATABASE", "default"),
    secure=True,
)

rows = ch.query(
    "SELECT captured_at, notebook, snippet_type, "
    "       substring(snippet, 1, 60) AS preview, latency_ms "
    "FROM clipboard_events "
    "ORDER BY captured_at DESC LIMIT 20"
).result_rows

for r in rows:
    print(r)
```

Run it. You should see your last 20 captures grouped by topic, with reasonable types and latencies.

---

## Acceptance check before moving on

All of these must pass:

- [ ] Copying text → row in ClickHouse → Track B's dashboard sees it (integration point 1 done)
- [ ] `notebook` names stay consistent across snippets of the same topic
- [ ] Median agent latency under 3 seconds
- [ ] `_fallback` does not appear in normal usage
- [ ] Watcher runs for at least 5 minutes without crashing
- [ ] You've notified Track B that point 1 is done

If any of these fail, fix it before opening `04-polish.md`. The polish file assumes a working pipe.
