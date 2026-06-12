# 04 — Polish, Bonus, Demo

**Goal:** by the end of this file, your Guild agent is published to the Agent Hub, your LLM calls are wrapped in Langfuse tracing (bonus), and you've rehearsed the demo with Track B twice.

**Time budget:** 90 minutes.

**Do not start this file until file 03's acceptance check is fully green.**

---

## Part A — Sharpen the agent (20 min)

Now that you've seen 50+ real classifications, the prompt almost certainly needs one of these adjustments. Pick the ones that match what you saw:

1. **Notebook name drift.** Same topic, slightly different names ("Linear Algebra" vs "Linear-Algebra" vs "LA"). Add this line near the top of the prompt:
   > Before assigning a notebook name, consider whether you have seen a similar topic before. If unsure, pick the most generic short name. Prefer "Linear Algebra" over "Eigenvectors" — coarse grouping beats fine-grained for this product.

2. **Wraps JSON in prose.** Add the JSON-only rule TWICE in the prompt (top and bottom). Models follow repeated constraints more reliably.

3. **`key_insight` too long.** Lower the max-char rule and add: `If you exceed the limit, rewrite shorter; do not truncate.`

After editing `agent.ts`:

```bash
guild agent test
# verify the issue is fixed across 5 different snippets
guild agent save --message "Sharpen prompt: stronger notebook consistency"
```

---

## Part B — Langfuse tracing bonus (30 min, OPTIONAL)

This is a bonus for the ClickHouse track because Langfuse uses ClickHouse as its backing store. Only attempt if Part A is clean.

### How this works

You wrap a thin Python proxy around the `guild chat --once` call and log each invocation to Langfuse. The agent still runs on Guild; Langfuse records the input, output, latency, and metadata.

### Step 1 — Langfuse account + keys

1. Sign up at `https://cloud.langfuse.com` (free tier).
2. Create a project named `magpie`.
3. Copy the **public key** and **secret key**.

### Step 2 — Install and configure

```bash
pip install langfuse
```

Add to `.env`:

```
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

### Step 3 — Wrap the agent call

In `watcher.py`, near the top with the other imports:

```python
from langfuse import Langfuse

langfuse = Langfuse(
    public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
    secret_key=os.environ["LANGFUSE_SECRET_KEY"],
    host=os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)
```

Replace `call_guild_agent` with this traced version (keep the old one as a backup until this works):

```python
def call_guild_agent(snippet: str) -> dict:
    trace = langfuse.trace(
        name="magpie-classify",
        input={"snippet": snippet[:500]},
    )
    generation = trace.generation(
        name="guild-agent",
        model="guild:magpie-agent",
        input=snippet[:500],
    )

    try:
        result = subprocess.run(
            ["guild", "chat", "--once", snippet, "--agent", GUILD_AGENT_ID],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        out = _fallback(snippet, reason="timeout")
        generation.end(output=out, level="ERROR")
        return out
    except FileNotFoundError:
        raise RuntimeError("guild CLI not on PATH")

    stdout = result.stdout.strip()
    match = JSON_BLOCK.search(stdout)

    if not match:
        out = _fallback(snippet, reason="no-json")
        generation.end(output=out, level="WARNING")
        return out

    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        out = _fallback(snippet, reason="bad-json")
        generation.end(output=out, level="ERROR")
        return out

    classification = {
        "notebook": str(data.get("notebook") or "Misc")[:60],
        "snippet_type": str(data.get("snippet_type") or "other")[:24],
        "key_insight": str(data.get("key_insight") or "")[:400],
        "tokens_estimated": int(data.get("tokens_estimated") or len(snippet) // 4),
    }

    generation.end(output=classification)
    trace.update(output=classification)
    return classification
```

### Step 4 — Verify

Run the watcher, copy 3 things, then open the Langfuse dashboard. You should see 3 traces with input snippets, output JSON, and timings. Show this in the demo.

If Langfuse setup eats more than 30 minutes, **revert to the un-traced version** and skip this bonus. Don't sink the main demo for a side prize.

---

## Part C — Publish the agent to the Agent Hub (15 min)

From inside `magpie-agent/`:

```bash
guild agent save --message "Magpie v1: study companion that classifies and files snippets" --wait --publish
```

`--wait` blocks until Guild's validation passes; `--publish` makes it installable by anyone.

Verify:

```bash
guild agent versions
# Shows the published version

guild agent search "magpie"
# Should find your agent
```

For the demo, you'll point Track B's screen at the Guild dashboard so judges can see:
- The published agent.
- Per-session run history.
- The observability view showing input → output for each classify call.

This is the **"we shipped a real installable agent"** beat.

---

## Part D — Demo prep with Track B (25 min)

### Reset clean state

```bash
# In a ClickHouse SQL console or via Python:
TRUNCATE TABLE clipboard_events;
```

(Coordinate with Track B — they may want some seed data left in for the opening shot.)

### Rehearse the demo twice

Read this aloud with Track B, then do it:

**The 90-second demo:**

1. Three browser tabs visible. OpenUI dashboard open on the side.
2. **"I'm studying — let me copy a definition."** Copy a definition. Wait ~2 seconds. **Card appears on Track B's dashboard.**
3. **"Now a related example from a different source."** Copy something else on the same topic. **It files into the same notebook.**
4. **"Different topic now."** Copy something off-topic. **A new notebook materializes — the UI recomposes.**
5. **"Let's see the analytics."** Flip to Track B's stats view. **Live ClickHouse queries — snippets per notebook, timeline, distribution.**
6. (Optional showpiece) Track B shows the session-summary card or contradiction flag.
7. **"And here's the agent itself, on Guild."** Open the Guild dashboard. **Show the published agent, the run history, the observability traces.**
8. (If Langfuse) Quick flash of the Langfuse dashboard with traced calls.

**Time the demo.** It must fit in 3 minutes. If it doesn't, cut step 8 first, then step 6.

### Two things to nail

1. **Latency.** From "copy" to "card appears" should be under 3 seconds. If it's slower on demo day, the magic dies. Pre-warm the watcher 60 seconds before showtime.
2. **Failure recovery.** If the agent ever returns garbage in the demo, the `_fallback` puts a "Misc" card on screen. That's better than nothing. Don't apologize on stage — keep going.

---

## Part E — Record a backup video (10 min)

After rehearsal:

1. Reset state. Start fresh.
2. Run the demo cleanly with screen recording on (QuickTime / OBS / Loom).
3. Save the file with the team. **If live demo fails on stage, you play the recording.** Every winning team has this.

---

## Acceptance check — you are done with Track A

- [ ] Agent published to Agent Hub, visible in `guild agent search`
- [ ] Watcher runs end-to-end for at least 5 consecutive minutes with no errors
- [ ] Latency from copy to ClickHouse row under 3 seconds median
- [ ] (Bonus) Langfuse dashboard shows traces, OR Langfuse skipped cleanly
- [ ] Joint demo with Track B rehearsed twice
- [ ] Backup recording saved

When all of these are checked: **stop coding.** Help Track B polish the dashboard if they need it, then go submit.
