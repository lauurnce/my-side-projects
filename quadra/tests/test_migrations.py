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
