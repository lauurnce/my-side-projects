import sqlite3
from pathlib import Path

import click
from flask import current_app, g

from .clock import utc_timestamp

MIGRATIONS = Path(__file__).parent / "migrations"
TABLES = ("attendees", "events", "schema_migrations")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def applied_migrations(db):
    db.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations"
        " (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    db.commit()
    return {row["name"] for row in db.execute("SELECT name FROM schema_migrations").fetchall()}


def apply_migration(db, path):
    for statement in path.read_text(encoding="utf-8").split(";"):
        if statement.strip():
            db.execute(statement)
    db.execute(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        (path.name, utc_timestamp()),
    )
    db.commit()


def migrate():
    db = get_db()
    applied = applied_migrations(db)
    pending = [path for path in sorted((MIGRATIONS / "sqlite").glob("*.sql")) if path.name not in applied]
    for path in pending:
        apply_migration(db, path)
    return [path.name for path in pending]


def seed_first_event():
    from .services.events import list_events, seed_from_config

    if list_events():
        return None
    return seed_from_config()


def drop_tables():
    db = get_db()
    for table in TABLES:
        db.execute(f"DROP TABLE IF EXISTS {table}")
    db.commit()


def init_db():
    drop_tables()
    migrate()
    return seed_first_event()


@click.command("migrate", help="Apply pending database migrations. Keeps existing data.")
def migrate_command():
    applied = migrate()
    for name in applied:
        click.echo(f"Applied {name}")
    if not applied:
        click.echo("The database is already up to date.")
    event = seed_first_event()
    if event is not None:
        click.echo(f"Created the event {event['name']} from .env.")


@click.command("init-db", help="Erase the database and rebuild it from the migrations.")
def init_db_command():
    event = init_db()
    click.echo("Initialized the database.")
    if event is None:
        click.echo("No event was created. Add one with: flask --app app add-event")
    else:
        click.echo(f"Created the event {event['name']} from .env.")


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(migrate_command)
    app.cli.add_command(init_db_command)
