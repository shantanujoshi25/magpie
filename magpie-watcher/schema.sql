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
