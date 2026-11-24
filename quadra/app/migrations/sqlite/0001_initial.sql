CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    venue TEXT NOT NULL,
    opens_on TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events (id),
    attendee_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    organization TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    ticket_token TEXT NOT NULL UNIQUE,
    qr_path TEXT,
    email_status TEXT NOT NULL DEFAULT 'pending',
    email_sent_at TEXT,
    checked_in INTEGER NOT NULL DEFAULT 0 CHECK (checked_in IN (0, 1)),
    checked_in_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (event_id, email)
);
