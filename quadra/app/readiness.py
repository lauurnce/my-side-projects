import sqlite3
from datetime import timedelta

import psycopg
from flask import (
    Blueprint,
    abort,
    current_app,
    g,
    got_request_exception,
    jsonify,
    request,
)

from .alerts import notify
from .clock import utc_now
from .db import get_db, shipped_migrations

bp = Blueprint("readiness", __name__)

RECHECK_AFTER = timedelta(seconds=10)
READY_ANSWER_LIFETIME = timedelta(seconds=15)
OPEN_ENDPOINTS = ("static", "main.health", "readiness.ready")
NO_MIGRATIONS_TABLE = (sqlite3.OperationalError, psycopg.errors.UndefinedTable)
MAINTENANCE_MESSAGE = "The site is being updated. Try again in a few minutes."
READY = {"status": "ok", "database": "ok", "schema": "current"}
BEHIND = {"status": "unavailable", "database": "ok", "schema": "behind"}
UNREACHABLE = {"status": "unavailable", "database": "unreachable", "schema": "unknown"}


def applied_names(db):
    try:
        rows = db.execute("SELECT name FROM schema_migrations").fetchall()
    except NO_MIGRATIONS_TABLE:
        db.rollback()
        return set()
    return {row["name"] for row in rows}


def missing_migrations():
    db = get_db()
    return sorted(set(shipped_migrations(db.dialect)) - applied_names(db))


def is_recent(moment, lifetime):
    return moment is not None and utc_now() - moment < lifetime


def schema_is_current(schema):
    if schema["current"]:
        return True
    if is_recent(schema["checked_at"], RECHECK_AFTER):
        return False
    missing = missing_migrations()
    schema.update(current=not missing, checked_at=utc_now())
    if missing:
        report_behind(missing)
    return not missing


def report_behind(missing):
    names = ", ".join(missing)
    current_app.logger.critical(
        "DATABASE IS BEHIND THE CODE. Missing migrations: %s. Every page answers 503 until"
        " 'flask --app app migrate' has run against this database.",
        names,
    )
    notify(f"The database is missing migrations the code needs ({names})")


@bp.before_app_request
def hold_requests_until_migrated():
    if request.endpoint in OPEN_ENDPOINTS:
        return
    if schema_is_current(current_app.extensions["readiness"]["schema"]):
        return
    g.account = None
    abort(503, description=MAINTENANCE_MESSAGE)


def check_again_after_an_error(app, **_signal):
    app.extensions["readiness"]["schema"].update(current=False, checked_at=None)


def measure_readiness():
    try:
        missing = missing_migrations()
    except Exception:
        current_app.logger.exception("The readiness check could not use the database.")
        return UNREACHABLE
    if missing:
        current_app.logger.error("Readiness check found missing migrations: %s", ", ".join(missing))
        return BEHIND
    return READY


@bp.get("/ready")
def ready():
    last = current_app.extensions["readiness"]["answer"]
    if not is_recent(last["measured_at"], READY_ANSWER_LIFETIME):
        last.update(body=measure_readiness(), measured_at=utc_now())
    response = jsonify(last["body"])
    response.status_code = 200 if last["body"] is READY else 503
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


def init_app(app):
    app.extensions["readiness"] = {
        "schema": {"current": False, "checked_at": None},
        "answer": {"body": None, "measured_at": None},
    }
    got_request_exception.connect(check_again_after_an_error, app)
    app.register_blueprint(bp)
