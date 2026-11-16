ALTER TABLE events ADD COLUMN review_applications INTEGER NOT NULL DEFAULT 0 CHECK (review_applications IN (0, 1));

ALTER TABLE attendees ADD COLUMN state TEXT NOT NULL DEFAULT 'accepted' CHECK (state IN ('pending', 'accepted', 'declined'));

ALTER TABLE attendees ADD COLUMN decided_at TEXT;

ALTER TABLE attendees ADD COLUMN decided_by_id BIGINT REFERENCES accounts (id);

ALTER TABLE attendees ADD COLUMN status_token TEXT DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

ALTER TABLE attendees ADD COLUMN email_claim TEXT;

ALTER TABLE attendees ADD COLUMN email_claimed_at TEXT;

CREATE UNIQUE INDEX attendees_status_token ON attendees (status_token);

UPDATE attendees SET email_status = 'none' WHERE email_status = 'pending';

CREATE TABLE application_attempts (
    address TEXT PRIMARY KEY,
    applications INTEGER NOT NULL,
    window_started_at TEXT NOT NULL
);

ALTER TABLE application_attempts ENABLE ROW LEVEL SECURITY;
