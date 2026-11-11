import secrets
import sqlite3

from flask import current_app

from ..db import get_db


class DuplicateEmailError(Exception):
    """Raised when the email address is already registered."""


def email_exists(email):
    row = get_db().execute(
        "SELECT 1 FROM attendees WHERE email = ?", (email.lower(),)
    ).fetchone()
    return row is not None


def create_attendee(full_name, email, organization, contact_number):
    """Insert a new attendee and return the saved row.

    Expects data that already passed validation. The attendee code is built
    from the row id (SEM-2026-0001, SEM-2026-0002, ...).
    """
    db = get_db()
    email = email.lower()
    token = secrets.token_urlsafe(32)
    prefix = current_app.config["ATTENDEE_CODE_PREFIX"]

    try:
        cur = db.execute(
            "INSERT INTO attendees"
            " (attendee_code, full_name, email, organization, contact_number, ticket_token)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (f"PENDING-{token}", full_name, email, organization, contact_number, token),
        )
        code = f"{prefix}-{cur.lastrowid:04d}"
        db.execute(
            "UPDATE attendees SET attendee_code = ? WHERE id = ?", (code, cur.lastrowid)
        )
        db.commit()
    except sqlite3.IntegrityError as exc:
        db.rollback()
        if "attendees.email" in str(exc):
            raise DuplicateEmailError(email) from exc
        raise

    return get_attendee_by_code(code)


def get_attendee_by_code(code):
    return get_db().execute(
        "SELECT * FROM attendees WHERE attendee_code = ?", (code,)
    ).fetchone()
