import sqlite3

import psycopg
import pytest

from app.db import close_db, get_db

INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg.IntegrityError)
NEW_EVENT = (
    "INSERT INTO events (slug, name, event_date, venue, created_at)"
    " VALUES (%s, %s, %s, %s, %s) RETURNING id"
)
NEW_ATTENDEE = (
    "INSERT INTO attendees (event_id, attendee_code, full_name, email, organization,"
    " contact_number, ticket_token, created_at) VALUES (%s, %s, 'A', %s, 'B', 'C', %s, 'now')"
)


@pytest.fixture
def db(app):
    with app.app_context():
        yield get_db()


def reopened():
    close_db()
    return get_db()


def add_event(db, slug):
    values = (slug, "Talks", "2027-02-09", "Hall", "2026-11-01T00:00:00+00:00")
    return db.execute(NEW_EVENT, values).fetchone()["id"]


def test_dialect_follows_the_database_url(app, db, postgres_url):
    assert db.dialect == ("postgres" if postgres_url else "sqlite")
    assert app.config["DATABASE_URL"] == postgres_url


def test_rows_are_read_by_column_name(db):
    row = db.execute("SELECT slug, name AS title, opens_on FROM events").fetchone()
    assert row == {"slug": "test-seminar", "title": "Test Seminar", "opens_on": None}
    assert db.execute("SELECT slug FROM events").fetchall() == [{"slug": "test-seminar"}]
    assert db.execute("SELECT slug FROM events WHERE slug = %s", ("nope",)).fetchone() is None


def test_values_are_bound_not_pasted_into_the_sql(db):
    tricky = "100% o'clock ?; DROP TABLE events; %s"
    event_id = add_event(db, "tricky")
    db.execute("UPDATE events SET venue = %s WHERE id = %s", (tricky, event_id))
    assert db.execute("SELECT venue FROM events WHERE id = %s", (event_id,)).fetchone()["venue"] == tricky


def test_nul_characters_are_dropped_from_text(db):
    event_id = add_event(db, "nul\x00led")
    row = db.execute("SELECT id FROM events WHERE slug = %s", ("n\x00ulled",)).fetchone()
    assert row == {"id": event_id}


def test_insert_returns_the_new_id_and_counts_start_at_one(db):
    first = add_event(db, "talks")
    second = add_event(db, "more-talks")
    assert (first, second) == (2, 3)


def test_rowcount_reports_changed_rows(db):
    add_event(db, "talks")
    assert db.execute("UPDATE events SET venue = %s", ("Gym",)).rowcount == 2
    assert db.execute("UPDATE events SET venue = %s WHERE slug = %s", ("Gym", "nope")).rowcount == 0


def test_commit_keeps_changes_for_the_next_connection(db):
    add_event(db, "talks")
    db.commit()
    assert reopened().execute("SELECT COUNT(*) AS total FROM events").fetchone()["total"] == 2


def test_uncommitted_changes_are_gone_on_the_next_connection(db):
    add_event(db, "talks")
    assert reopened().execute("SELECT COUNT(*) AS total FROM events").fetchone()["total"] == 1


def test_rollback_discards_changes(db):
    add_event(db, "talks")
    db.rollback()
    assert db.execute("SELECT COUNT(*) AS total FROM events").fetchone()["total"] == 1


def test_attendee_must_belong_to_a_real_event(db):
    with pytest.raises(INTEGRITY_ERRORS):
        db.execute(NEW_ATTENDEE, (999, "SEM-1", "a@example.com", "token-1"))


def test_same_email_twice_for_one_event_is_refused(db):
    event_id = db.execute("SELECT id FROM events").fetchone()["id"]
    db.execute(NEW_ATTENDEE, (event_id, "SEM-1", "a@example.com", "token-1"))
    with pytest.raises(INTEGRITY_ERRORS):
        db.execute(NEW_ATTENDEE, (event_id, "SEM-2", "a@example.com", "token-2"))


def test_same_email_for_another_event_is_allowed(db):
    first = db.execute("SELECT id FROM events").fetchone()["id"]
    second = add_event(db, "talks")
    db.execute(NEW_ATTENDEE, (first, "SEM-1", "a@example.com", "token-1"))
    db.execute(NEW_ATTENDEE, (second, "SEM-2", "a@example.com", "token-2"))
    assert db.execute("SELECT COUNT(*) AS total FROM attendees").fetchone()["total"] == 2
