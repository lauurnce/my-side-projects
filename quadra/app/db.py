import sqlite3

import click
from flask import current_app, g


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    from .services.events import seed_from_config

    db = get_db()
    with current_app.open_resource("schema.sql") as f:
        db.executescript(f.read().decode("utf-8"))
    return seed_from_config()


@click.command("init-db", help="Drop and recreate the database tables.")
def init_db_command():
    event = init_db()
    click.echo("Initialized the database.")
    if event is None:
        click.echo("No event was created. Add one with: flask --app app add-event")
    else:
        click.echo(f"Created the event {event['name']} from .env.")


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)
