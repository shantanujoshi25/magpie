"""
Magpie watcher.

Polls the system clipboard, invokes the Guild agent on each new copy,
parses the agent's JSON response, and writes a row to ClickHouse.
"""

import json
import os
import queue
import re
import subprocess
import threading
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
GUILD_AGENT_ID = os.environ.get("GUILD_AGENT_ID", "shanjoshi25~magpie-agent")

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


def _pick(data: dict, *keys, default=None):
    """Return the first present key from `keys` (tolerates spelling variants
    such as snippet_type vs snippettype that the agent emits inconsistently)."""
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return default


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

    # Coerce and default fields the agent might omit. The agent is inconsistent
    # about underscores in key names, so accept both spellings.
    return {
        "notebook": str(_pick(data, "notebook") or "Misc")[:60],
        "snippet_type": str(_pick(data, "snippet_type", "snippettype") or "other")[:24],
        "key_insight": str(_pick(data, "key_insight", "keyinsight") or "")[:400],
        "tokens_estimated": int(
            _pick(data, "tokens_estimated", "tokensestimated") or len(snippet) // 4
        ),
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
# Background worker
# ---------------------------------------------------------------------------
#
# The clipboard poll loop must never block, so that you can keep clipping
# while Guild classifies in the background. Each captured snippet is pushed
# onto a queue; a worker thread drains it (classify -> insert) at its own
# pace. A rapid burst of copies queues up and is processed in order.

work_q: "queue.Queue[tuple[str, str]]" = queue.Queue()


def worker() -> None:
    while True:
        snippet, window = work_q.get()
        try:
            t0 = time.time()
            classification = call_guild_agent(snippet)
            latency_ms = int((time.time() - t0) * 1000)

            print(
                f"[agent] notebook={classification['notebook']!r} "
                f"type={classification['snippet_type']!r} "
                f"latency={latency_ms}ms (queue={work_q.qsize()})"
            )

            try:
                insert_event(snippet, classification, window, latency_ms)
                print("[ch] inserted")
            except Exception as exc:
                print(f"[ch] insert failed: {exc}")
        finally:
            work_q.task_done()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"[magpie] watching clipboard. agent={GUILD_AGENT_ID}")

    threading.Thread(target=worker, daemon=True).start()

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

            # Hand off to the worker and immediately resume polling so rapid
            # clips are never missed.
            work_q.put((snippet, window))

        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
