import sqlite3
from pathlib import Path

import click
import psycopg
from flask import current_app, g
from flask.cli import with_appcontext
from psycopg.rows import dict_row

from .clock import utc_timestamp

MIGRATIONS = Path(__file__).parent / "migrations"
TABLES = (
    "attendees",
    "events",
    "account_tokens",
    "login_attempts",
    "application_attempts",
    "error_alerts",
    "accounts",
    "schema_migrations",
)


def without_nul(value):
    return value.replace("\x00", "") if isinstance(value, str) else value


class Database:
    def __init__(self, connection, dialect):
        self.connection = connection
        self.dialect = dialect

    def execute(self, sql, params=()):
        if self.dialect == "sqlite":
            sql = sql.replace("%s", "?")
        return self.connection.execute(sql, [without_nul(value) for value in params])

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


def sqlite_dict_row(cursor, values):
    return {column[0]: value for column, value in zip(cursor.description, values, strict=True)}


def open_sqlite(path):
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite_dict_row
    connection.execute("PRAGMA foreign_keys = ON")
    return Database(connection, "sqlite")


def open_postgres(url):
    connection = psycopg.connect(url, row_factory=dict_row, prepare_threshold=None)
    return Database(connection, "postgres")


def get_db():
    if "db" not in g:
        url = current_app.config["DATABASE_URL"]
        g.db = open_postgres(url) if url else open_sqlite(current_app.config["DATABASE"])
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
        "INSERT INTO schema_migrations (name, applied_at) VALUES (%s, %s)",
        (path.name, utc_timestamp()),
    )
    db.commit()


def shipped_migrations(dialect):
    return sorted(path.name for path in (MIGRATIONS / dialect).glob("*.sql"))


def migrate():
    db = get_db()
    applied = applied_migrations(db)
    pending = [name for name in shipped_migrations(db.dialect) if name not in applied]
    for name in pending:
        apply_migration(db, MIGRATIONS / db.dialect / name)
    return pending


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


def init_db(force=False, seed=True):
    if current_app.config["DATABASE_URL"] and not force:
        raise click.ClickException(
            "DATABASE_URL is set, so init-db would erase that database."
            " Use migrate to update it, or add --force to erase it anyway."
        )
    drop_tables()
    migrate()
    return seed_first_event() if seed else None


NO_EVENT_HELP = "Do not create the first event from .env. Use this before restoring a backup."


@click.command("migrate", help="Apply pending database migrations. Keeps existing data.")
@click.option("--no-event", is_flag=True, help=NO_EVENT_HELP)
@with_appcontext
def migrate_command(no_event):
    applied = migrate()
    for name in applied:
        click.echo(f"Applied {name}")
    if not applied:
        click.echo("The database is already up to date.")
    event = None if no_event else seed_first_event()
    if event is not None:
        click.echo(f"Created the event {event['name']} from .env.")


@click.command("init-db", help="Erase the local database and rebuild it from the migrations.")
@click.option("--force", is_flag=True, help="Erase the database even when DATABASE_URL is set.")
@click.option("--no-event", is_flag=True, help=NO_EVENT_HELP)
@with_appcontext
def init_db_command(force, no_event):
    event = init_db(force, seed=not no_event)
    click.echo("Initialized the database.")
    if event is None:
        click.echo("No event was created. Add one with: flask --app app add-event")
    else:
        click.echo(f"Created the event {event['name']} from .env.")


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(migrate_command)
    app.cli.add_command(init_db_command)
