ALTER TABLE events ADD COLUMN published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1));

ALTER TABLE events ADD COLUMN registration_closed INTEGER NOT NULL DEFAULT 0 CHECK (registration_closed IN (0, 1));

ALTER TABLE events ADD COLUMN updated_at TEXT;

ALTER TABLE events ADD COLUMN updated_by_id BIGINT REFERENCES accounts (id);
