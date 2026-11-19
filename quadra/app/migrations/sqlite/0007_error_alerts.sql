CREATE TABLE error_alerts (
    kind TEXT PRIMARY KEY,
    last_sent_at TEXT NOT NULL,
    suppressed INTEGER NOT NULL DEFAULT 0
);
