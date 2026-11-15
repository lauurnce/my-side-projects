CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE account_tokens (
    account_id INTEGER PRIMARY KEY REFERENCES accounts (id),
    purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
    email TEXT PRIMARY KEY,
    failures INTEGER NOT NULL,
    last_failed_at TEXT NOT NULL
);

ALTER TABLE attendees ADD COLUMN checked_in_by_id INTEGER REFERENCES accounts (id);

ALTER TABLE events ADD COLUMN created_by_id INTEGER REFERENCES accounts (id);
