# 01 — Setup

**Goal:** by the end of this file, you have Guild CLI authed, an LLM agent scaffolded locally, ClickHouse connection details from Track B, and the agreed schema confirmed.

**Time budget:** 30 minutes. If you blow past 45, stop and ask the team for help.

---

## Step 1 — Install and auth the Guild CLI

```bash
# Install
npm install -g @guildai/cli

# Auth (opens a browser)
guild auth login

# Verify
guild auth status
# Should print: ✓ Authenticated
```

If `guild auth status` doesn't say authenticated, run `guild doctor` and follow what it prints.

---

## Step 2 — Pick a workspace

```bash
guild workspace list
guild workspace select
# Pick /home or create one — interactive prompt
guild workspace current
# Confirms which workspace is the default
```

Save the workspace ID/name somewhere — you'll need it.

---

## Step 3 — Scaffold the agent locally

```bash
mkdir magpie-agent && cd magpie-agent
guild agent init --name magpie-agent --template LLM
```

This creates:

```
magpie-agent/
├── agent.ts          # you'll edit this in file 02
├── package.json
├── tsconfig.json
├── guild.json
└── .gitignore
```

Confirm it works out of the box:

```bash
guild agent test
# Opens an interactive chat; type anything; press Ctrl+C to exit
```

If `guild agent test` opens a session and the default agent replies, you're good.

---

## Step 4 — Get ClickHouse details from Track B

Ask Track B for:

1. **Connection host** — looks like `xxxxx.us-east-1.aws.clickhouse.cloud`
2. **Port** — almost certainly `8443` (HTTPS)
3. **Username** — almost certainly `default`
4. **Password** — they set this at signup
5. **Database name** — usually `default`
6. **Confirmation the table exists** — they should run the schema below and tell you "table is created"

The agreed schema (paste into a `schema.sql` and keep it for reference; **do not change it**):

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

## Step 5 — Set up a Python environment for the watcher

```bash
cd ..  # back out of magpie-agent
mkdir magpie-watcher && cd magpie-watcher
python3 -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install pyperclip clickhouse-connect pygetwindow
```

Notes:
- `pyperclip` — clipboard polling
- `clickhouse-connect` — official ClickHouse Python client, works over HTTPS
- `pygetwindow` — active window title (best-effort cross-platform)

On macOS, you may also need:

```bash
pip install pyobjc-framework-Cocoa
```

---

## Step 6 — Test the ClickHouse connection from Python

Create a file `test_clickhouse.py` in `magpie-watcher/`:

```python
import clickhouse_connect

client = clickhouse_connect.get_client(
    host="PASTE_HOST_HERE",
    port=8443,
    username="default",
    password="PASTE_PASSWORD_HERE",
    secure=True,
)

print(client.query("SELECT 1").result_rows)
# Should print: [(1,)]

print(client.query("SELECT count() FROM clipboard_events").result_rows)
# Should print: [(0,)] or whatever rowcount exists
```

Run it:

```bash
python test_clickhouse.py
```

If both queries succeed, the data pipe is verified end-to-end on the database side. Delete this file before committing anything.

---

## Step 7 — Save credentials securely

Create `.env` in `magpie-watcher/`:

```
CLICKHOUSE_HOST=xxxxx.us-east-1.aws.clickhouse.cloud
CLICKHOUSE_PORT=8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=...
CLICKHOUSE_DATABASE=default
GUILD_AGENT_ID=magpie-agent
```

Add to `.gitignore`:

```
.env
.venv/
__pycache__/
```

Also `pip install python-dotenv` so the watcher can read it later.

```bash
pip install python-dotenv
```

---

## Acceptance check before moving on

All of these must pass:

- [ ] `guild auth status` shows authenticated
- [ ] `guild workspace current` shows a real workspace
- [ ] `guild agent test` from inside `magpie-agent/` opens a working session
- [ ] `python test_clickhouse.py` prints `[(1,)]` and a rowcount
- [ ] You have a `.env` file with all five ClickHouse values and the agent ID
- [ ] Track B has confirmed the `clipboard_events` table is created and the schema matches

If any of these fail, fix it before opening `02-agent.md`. The whole build assumes these are green.
