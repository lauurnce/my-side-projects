import sqlite3

import psycopg
import pytest

from app import db as database
from app.db import MIGRATIONS, drop_tables, get_db, migrate

SHIPPED_MIGRATIONS = sorted(path.name for path in (MIGRATIONS / "sqlite").glob("*.sql"))

LEGACY_SCHEMA = """
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    venue TEXT NOT NULL,
    opens_on TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
INSERT INTO events (slug, name, event_date, venue) VALUES ('old-seminar', 'Old Seminar', '2026-11-30', 'Main Hall')
"""


@pytest.fixture
def blank(app):
    with app.app_context():
        drop_tables()
        yield app


@pytest.fixture
def two_step_migrations(blank, tmp_path, monkeypatch):
    folder = tmp_path / "migrations" / get_db().dialect
    folder.mkdir(parents=True)
    (folder / "0001_notes.sql").write_text("CREATE TABLE notes (body TEXT NOT NULL);\n")
    monkeypatch.setattr(database, "MIGRATIONS", tmp_path / "migrations")
    yield folder
    get_db().rollback()
    get_db().execute("DROP TABLE IF EXISTS notes")
    get_db().commit()


def applied_names():
    rows = get_db().execute("SELECT name FROM schema_migrations ORDER BY name").fetchall()
    return [row["name"] for row in rows]


def count(table):
    return get_db().execute(f"SELECT COUNT(*) AS total FROM {table}").fetchone()["total"]


def test_fresh_database_gets_every_migration(blank):
    assert migrate() == SHIPPED_MIGRATIONS
    assert applied_names() == SHIPPED_MIGRATIONS
    assert count("events") == 0
    assert count("attendees") == 0


def test_fresh_database_has_the_account_tables_and_audit_columns(blank):
    migrate()
    assert count("accounts") == 0
    assert count("account_tokens") == 0
    assert count("login_attempts") == 0
    get_db().execute("SELECT checked_in_by_id FROM attendees").fetchall()
    get_db().execute("SELECT created_by_id FROM events").fetchall()


def test_every_table_has_row_level_security_on_postgres(blank):
    if get_db().dialect != "postgres":
        pytest.skip("row level security only exists on postgres")
    migrate()
    tables = get_db().execute(
        "SELECT relname, relrowsecurity FROM pg_class"
        " WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace"
    ).fetchall()
    assert {table["relname"] for table in tables} == set(database.TABLES)
    assert all(table["relrowsecurity"] for table in tables)


def test_existing_rows_survive_the_accounts_migration(blank):
    folder = database.MIGRATIONS / get_db().dialect
    database.applied_migrations(get_db())
    for name in SHIPPED_MIGRATIONS[:2]:
        database.apply_migration(get_db(), folder / name)
    get_db().execute(
        "INSERT INTO events (slug, name, event_date, venue, created_at)"
        " VALUES ('old', 'Old Seminar', '2026-11-30', 'Hall', '2026-11-01T00:00:00+00:00')"
    )
    get_db().execute(
        "INSERT INTO attendees (event_id, attendee_code, full_name, email, organization, contact_number,"
        " ticket_token, checked_in, checked_in_at, created_at) VALUES (1, 'SEM-2026-0001', 'Juan', 'juan@example.com',"
        " 'PUP', '+639171234567', 'token', 1, '2026-11-30T08:15:00+00:00', '2026-11-01T00:00:00+00:00')"
    )
    get_db().commit()

    assert migrate() == SHIPPED_MIGRATIONS[2:]
    attendee = get_db().execute("SELECT * FROM attendees").fetchone()
    assert (attendee["checked_in"], attendee["checked_in_by_id"]) == (1, None)
    assert get_db().execute("SELECT * FROM events").fetchone()["created_by_id"] is None


def test_existing_events_stay_published_and_open_after_the_event_management_migration(blank):
    folder = database.MIGRATIONS / get_db().dialect
    database.applied_migrations(get_db())
    for name in SHIPPED_MIGRATIONS[:3]:
        database.apply_migration(get_db(), folder / name)
    get_db().execute(
        "INSERT INTO events (slug, name, event_date, venue, opens_on, created_at)"
        " VALUES ('old', 'Old Seminar', '2026-11-30', 'Hall', '2026-11-10', '2026-11-01T00:00:00+00:00')"
    )
    get_db().execute(
        "INSERT INTO attendees (event_id, attendee_code, full_name, email, organization, contact_number,"
        " ticket_token, created_at) VALUES (1, 'SEM-2026-0001', 'Juan', 'juan@example.com',"
        " 'PUP', '+639171234567', 'token', '2026-11-01T00:00:00+00:00')"
    )
    get_db().commit()

    assert migrate() == SHIPPED_MIGRATIONS[3:]
    event = get_db().execute("SELECT * FROM events").fetchone()
    assert (event["published"], event["registration_closed"]) == (1, 0)
    assert (event["updated_at"], event["updated_by_id"]) == (None, None)
    assert (event["slug"], event["opens_on"]) == ("old", "2026-11-10")
    assert count("attendees") == 1


def test_running_again_applies_nothing_and_keeps_the_data(app, client, valid_form):
    client.post("/events/test-seminar/register", data=valid_form)
    with app.app_context():
        assert migrate() == []
        assert migrate() == []
        assert applied_names() == SHIPPED_MIGRATIONS
        assert count("events") == 1
        assert count("attendees") == 1


def test_every_migration_exists_for_both_databases():
    names = {
        dialect: sorted(path.name for path in (database.MIGRATIONS / dialect).glob("*.sql"))
        for dialect in ("sqlite", "postgres")
    }
    assert names["sqlite"] == names["postgres"]
    assert names["sqlite"]


def test_only_new_migrations_are_applied(two_step_migrations):
    assert migrate() == ["0001_notes.sql"]
    get_db().execute("INSERT INTO notes (body) VALUES ('kept')")
    get_db().commit()

    (two_step_migrations / "0002_author.sql").write_text(
        "ALTER TABLE notes ADD COLUMN author TEXT;\nUPDATE notes SET author = 'staff';\n"
    )
    assert migrate() == ["0002_author.sql"]
    assert migrate() == []
    assert applied_names() == ["0001_notes.sql", "0002_author.sql"]
    assert get_db().execute("SELECT * FROM notes").fetchall() == [{"body": "kept", "author": "staff"}]


def test_failed_migration_is_not_recorded(two_step_migrations):
    (two_step_migrations / "0002_broken.sql").write_text("ALTER TABLE missing ADD COLUMN author TEXT;\n")
    with pytest.raises((sqlite3.Error, psycopg.Error)):
        migrate()
    get_db().rollback()
    assert applied_names() == ["0001_notes.sql"]


def test_migrate_command_builds_and_seeds_a_fresh_database(blank):
    result = blank.test_cli_runner().invoke(args=["migrate"])
    assert result.exit_code == 0
    assert "Applied 0001_initial.sql" in result.output
    assert "Created the event Test Seminar from .env." in result.output
    assert count("events") == 1


def test_migrate_command_twice_does_not_seed_twice(blank):
    runner = blank.test_cli_runner()
    runner.invoke(args=["migrate"])
    result = runner.invoke(args=["migrate"])
    assert result.exit_code == 0
    assert "The database is already up to date." in result.output
    assert "Created the event" not in result.output
    assert count("events") == 1


def test_migrate_command_without_event_settings_seeds_nothing(blank):
    blank.config["EVENT_DATE"] = "TBA"
    result = blank.test_cli_runner().invoke(args=["migrate"])
    assert result.exit_code == 0
    assert count("events") == 0


def test_database_from_before_migrations_keeps_its_rows(blank):
    if get_db().dialect != "sqlite":
        pytest.skip("only local sqlite files predate the migrations")
    for statement in LEGACY_SCHEMA.split(";"):
        get_db().execute(statement)
    get_db().commit()

    assert migrate() == SHIPPED_MIGRATIONS
    assert [event["slug"] for event in get_db().execute("SELECT * FROM events").fetchall()] == ["old-seminar"]
    assert count("attendees") == 0


def test_init_db_erases_and_rebuilds(app, client, valid_form):
    client.post("/events/test-seminar/register", data=valid_form)
    force = ["--force"] if app.config["DATABASE_URL"] else []
    result = app.test_cli_runner().invoke(args=["init-db", *force])
    assert result.exit_code == 0
    assert "Initialized the database." in result.output
    with app.app_context():
        assert count("attendees") == 0
        assert count("events") == 1


def test_init_db_refuses_a_database_url_without_force(app, client, valid_form):
    client.post("/events/test-seminar/register", data=valid_form)
    real_url = app.config["DATABASE_URL"]
    app.config["DATABASE_URL"] = real_url or "postgresql://never-opened.invalid/quadra"
    result = app.test_cli_runner().invoke(args=["init-db"])
    app.config["DATABASE_URL"] = real_url

    assert result.exit_code != 0
    assert "DATABASE_URL is set" in result.output
    with app.app_context():
        assert count("attendees") == 1


def test_existing_attendees_and_events_keep_working_after_the_review_migration(blank):
    folder = database.MIGRATIONS / get_db().dialect
    database.applied_migrations(get_db())
    for name in SHIPPED_MIGRATIONS[:4]:
        database.apply_migration(get_db(), folder / name)
    get_db().execute(
        "INSERT INTO events (slug, name, event_date, venue, created_at)"
        " VALUES ('old', 'Old Seminar', '2026-11-30', 'Hall', '2026-11-01T00:00:00+00:00')"
    )
    for number, email_status in enumerate(("sent", "failed", "pending"), start=1):
        get_db().execute(
            "INSERT INTO attendees (event_id, attendee_code, full_name, email, organization, contact_number,"
            " ticket_token, email_status, created_at) VALUES (1, %s, 'Juan', %s, 'PUP', '+639171234567', %s, %s,"
            " '2026-11-01T00:00:00+00:00')",
            (f"SEM-2026-000{number}", f"juan{number}@example.com", f"token-{number}", email_status),
        )
    get_db().commit()

    assert migrate() == SHIPPED_MIGRATIONS[4:]
    assert get_db().execute("SELECT review_applications FROM events").fetchone() == {"review_applications": 0}
    attendees = get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()
    assert [attendee["state"] for attendee in attendees] == ["accepted"] * 3
    assert [attendee["email_status"] for attendee in attendees] == ["sent", "failed", "none"]
    assert [attendee["decided_by_id"] for attendee in attendees] == [None] * 3
    tokens = {attendee["status_token"] for attendee in attendees}
    assert len(tokens) == 3
    assert all(len(token) == 64 for token in tokens)
    assert count("application_attempts") == 0


def test_tickets_issued_before_the_review_migration_still_work(app, client, make_account, sign_in):
    with app.app_context():
        drop_tables()
        folder = database.MIGRATIONS / get_db().dialect
        database.applied_migrations(get_db())
        for name in SHIPPED_MIGRATIONS[:4]:
            database.apply_migration(get_db(), folder / name)
        get_db().execute(
            "INSERT INTO events (slug, name, event_date, venue, created_at)"
            " VALUES ('old', 'Old Seminar', '2026-11-30', 'Hall', '2026-11-01T00:00:00+00:00')"
        )
        get_db().execute(
            "INSERT INTO attendees (event_id, attendee_code, full_name, email, organization, contact_number,"
            " ticket_token, created_at) VALUES (1, 'SEM-2026-0001', 'Juan', 'juan@example.com', 'PUP',"
            " '+639171234567', 'old-token', '2026-11-01T00:00:00+00:00')"
        )
        get_db().commit()
        migrate()
        status_token = get_db().execute("SELECT status_token FROM attendees").fetchone()["status_token"]
    staff_client = sign_in(make_account("staff@example.com"))

    assert client.get("/ticket/old-token.png").status_code == 200
    assert "old-token" in client.get(f"/application/{status_token}").get_data(as_text=True)
    assert staff_client.post("/api/checkin", json={"code": "old-token"}).get_json()["status"] == "checked_in"
    registered = client.post(
        "/events/old/register",
        data={"full_name": "Maria", "email": "maria@example.com", "organization": "TUP", "contact_number": "09181234567", "consent": "yes"},
        follow_redirects=True,
    ).get_data(as_text=True)
    assert "Registration complete" in registered
    dashboard = staff_client.get("/admin?event=old").get_data(as_text=True)
    assert "New registrations are accepted automatically." in dashboard
    assert '<b id="emails-waiting">1</b> waiting' in dashboard


def test_a_row_written_by_the_previous_release_still_gets_a_status_token_on_postgres(app):
    with app.app_context():
        if get_db().dialect != "postgres":
            pytest.skip("only the hosted postgres database serves two releases during a deploy")
        get_db().execute(
            "INSERT INTO attendees (event_id, attendee_code, full_name, email, organization, contact_number,"
            " ticket_token, created_at) VALUES (1, 'SEM-2026-0001', 'Juan', 'juan@example.com', 'PUP',"
            " '+639171234567', 'old-token', '2026-11-01T00:00:00+00:00')"
        )
        get_db().commit()
        attendee = get_db().execute("SELECT * FROM attendees").fetchone()
    assert (attendee["state"], len(attendee["status_token"])) == ("accepted", 64)
