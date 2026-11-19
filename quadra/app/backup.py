import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit

import click
import psycopg
from flask import current_app
from flask.cli import with_appcontext

from .clock import utc_now, utc_timestamp
from .db import TABLES, get_db

FORMAT = "quadra-backup"
FORMAT_VERSION = 1
MIGRATIONS_TABLE = "schema_migrations"
ERASE_ORDER = tuple(table for table in TABLES if table != MIGRATIONS_TABLE)
LOAD_ORDER = tuple(reversed(ERASE_ORDER))
COUNTED_TABLES = ("accounts", "events", "attendees")
ROWS_PER_INSERT = 30
DATABASE_ERRORS = (sqlite3.Error, psycopg.Error)
BEGIN_SNAPSHOT = {
    "sqlite": "BEGIN",
    "postgres": "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
}
LAST_ISSUED_ID = {
    "sqlite": "SELECT COALESCE(MAX(seq), 0) AS last_id FROM sqlite_sequence WHERE name = %s",
    "postgres": (
        "SELECT COALESCE(pg_sequence_last_value(pg_get_serial_sequence(%s, 'id')::regclass), 0) AS last_id"
    ),
}


TABLE_NAMES = {
    "sqlite": "SELECT name FROM sqlite_master WHERE type = 'table'",
    "postgres": "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()",
}


def tables_in_database(db):
    present = {row["name"] for row in db.execute(TABLE_NAMES[db.dialect]).fetchall()}
    return [table for table in LOAD_ORDER if table in present]


def applied_migrations(db):
    rows = db.execute(f"SELECT name FROM {MIGRATIONS_TABLE} ORDER BY name").fetchall()
    return [row["name"] for row in rows]


def last_issued_id(db, table):
    return db.execute(LAST_ISSUED_ID[db.dialect], (table,)).fetchone()["last_id"]


def take_backup():
    db = get_db()
    db.rollback()
    db.execute(BEGIN_SNAPSHOT[db.dialect])
    try:
        return {
            "format": FORMAT,
            "version": FORMAT_VERSION,
            "created_at": utc_timestamp(),
            "source": db.dialect,
            "migrations": applied_migrations(db),
            "last_ids": {table: last_issued_id(db, table) for table in COUNTED_TABLES},
            "tables": {
                table: db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
                for table in tables_in_database(db)
            },
        }
    finally:
        db.rollback()


def default_backup_path():
    return Path(current_app.instance_path) / "backups" / f"quadra-{utc_now():%Y%m%d-%H%M%S}.json"


def write_private_file(path, text):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(text)


def is_understood(backup):
    return (
        isinstance(backup, dict)
        and (backup.get("format"), backup.get("version")) == (FORMAT, FORMAT_VERSION)
        and isinstance(backup.get("migrations"), list)
        and isinstance(backup.get("tables"), dict)
    )


def read_backup(path):
    try:
        backup = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise click.ClickException(f"{path} could not be read as a backup: {error}") from None
    if not is_understood(backup):
        raise click.ClickException(f"{path} is not a Quadra backup this version can load.")
    unknown = sorted(set(backup["tables"]) - set(LOAD_ORDER))
    if unknown:
        raise click.ClickException(f"The backup has tables this version does not know: {', '.join(unknown)}.")
    return backup


def refuse_other_migrations(db, backup):
    try:
        applied = applied_migrations(db)
    except DATABASE_ERRORS:
        db.rollback()
        applied = []
    if applied == backup["migrations"]:
        return
    raise click.ClickException(
        "The backup and this database are at different migrations."
        f" Backup: {', '.join(backup['migrations']) or 'none'}."
        f" Database: {', '.join(applied) or 'none'}."
        " Bring the database to the same migrations first, or add --force to load it anyway."
    )


def refuse_existing_rows(db):
    counts = {table: db.execute(f"SELECT COUNT(*) AS total FROM {table}").fetchone()["total"] for table in LOAD_ORDER}
    filled = [f"{table} ({total})" for table, total in counts.items() if total]
    if not filled:
        return
    raise click.ClickException(
        f"This database already has rows in {', '.join(filled)}."
        " Restore only loads into an empty database. Add --force to erase those rows and load the backup."
    )


def columns_of(db, table):
    return {column[0] for column in db.execute(f"SELECT * FROM {table} LIMIT 0").description}


def insert_rows(db, table, rows):
    if not rows:
        return
    columns = list(rows[0])
    unknown = sorted(set(columns) - columns_of(db, table))
    if unknown or any(list(row) != columns for row in rows):
        raise click.ClickException(f"The rows of {table} in the backup do not fit this database's columns.")
    one_row = f"({', '.join(['%s'] * len(columns))})"
    for start in range(0, len(rows), ROWS_PER_INSERT):
        chunk = rows[start:start + ROWS_PER_INSERT]
        db.execute(
            f"INSERT INTO {table} ({', '.join(columns)}) VALUES {', '.join([one_row] * len(chunk))}",
            [value for row in chunk for value in row.values()],
        )


def continue_ids_after(db, table, recorded):
    highest = db.execute(f"SELECT COALESCE(MAX(id), 0) AS highest FROM {table}").fetchone()["highest"]
    last_id = max(recorded, highest)
    if last_id == 0:
        return
    if db.dialect == "postgres":
        db.execute("SELECT setval(pg_get_serial_sequence(%s, 'id')::regclass, %s)", (table, last_id))
        return
    db.execute("DELETE FROM sqlite_sequence WHERE name = %s", (table,))
    db.execute("INSERT INTO sqlite_sequence (name, seq) VALUES (%s, %s)", (table, last_id))


def load_rows(db, backup):
    for table in ERASE_ORDER:
        db.execute(f"DELETE FROM {table}")
    for table in LOAD_ORDER:
        insert_rows(db, table, backup["tables"].get(table, []))
    for table in COUNTED_TABLES:
        continue_ids_after(db, table, backup.get("last_ids", {}).get(table, 0))


def restore_backup(backup, force=False):
    db = get_db()
    if not force:
        refuse_other_migrations(db, backup)
        refuse_existing_rows(db)
    try:
        load_rows(db, backup)
        db.commit()
    except DATABASE_ERRORS as error:
        raise click.ClickException(
            f"The restore failed and nothing was changed. {type(error).__name__}: {error}"
        ) from None
    finally:
        db.rollback()
    return sum(len(rows) for rows in backup["tables"].values())


def database_name():
    url = current_app.config["DATABASE_URL"]
    if not url:
        return f"the SQLite file {current_app.config['DATABASE']}"
    address = urlsplit(url)
    return f"the Postgres database {address.path.lstrip('/')} on {address.hostname}"


@click.command("backup", help="Write every table and the applied migrations to one private JSON file.")
@click.option("--to", "destination", type=click.Path(dir_okay=False, path_type=Path), help="File to write. Default: instance/backups/quadra-<UTC time>.json.")
@with_appcontext
def backup_command(destination):
    path = destination or default_backup_path()
    backup = take_backup()
    try:
        write_private_file(path, json.dumps(backup, indent=1, ensure_ascii=False))
    except FileExistsError:
        raise click.ClickException(f"{path} already exists. Choose another file.") from None
    rows = sum(len(table) for table in backup["tables"].values())
    click.echo(f"Backed up {rows} rows from {database_name()} at migration {(backup['migrations'] or ['none'])[-1]}.")
    click.echo(f"Wrote {path.resolve()}")
    click.echo("This file holds personal data and password hashes. Only your user can read it (mode 600).")
    click.echo("Keep it out of git, chats and shared folders.")


@click.command("restore", help="Load a backup file into an empty database at the same migrations. All or nothing.")
@click.argument("file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--force", is_flag=True, help="Erase the rows already there, and load even when the migrations differ.")
@click.option("--production", is_flag=True, help="Allow the restore when QUADRA_ENV is production.")
@with_appcontext
def restore_command(file, force, production):
    if current_app.config["PRODUCTION"] and not production:
        raise click.ClickException(
            f"QUADRA_ENV is production, so this would load into {database_name()}."
            " Add --production if that is what you mean."
        )
    backup = read_backup(file)
    rows = restore_backup(backup, force)
    click.echo(f"Restored {rows} rows from the backup of {backup['created_at']} into {database_name()}.")


def init_app(app):
    app.cli.add_command(backup_command)
    app.cli.add_command(restore_command)
