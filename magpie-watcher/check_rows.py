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
