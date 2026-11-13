import secrets
import sqlite3

from flask import current_app

from ..db import get_db
from .qr import generate_qr


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

    # On new entry: build the ticket QR right after the insert.
    return attach_qr(get_attendee_by_code(code))


def save_qr_path(attendee_id, path):
    db = get_db()
    db.execute("UPDATE attendees SET qr_path = ? WHERE id = ?", (path, attendee_id))
    db.commit()


def attach_qr(attendee):
    """Generate the ticket QR for a saved attendee and store its path.

    If generation fails the error is logged and the registration is kept.
    """
    try:
        path = generate_qr(attendee)
    except Exception:
        current_app.logger.exception("QR generation failed for %s", attendee["attendee_code"])
        return attendee
    save_qr_path(attendee["id"], path)
    return get_attendee_by_code(attendee["attendee_code"])


def regenerate_qr_codes():
    """Rebuild ticket QR images for every attendee.

    Returns the list of attendee codes that were rebuilt.
    """
    rows = get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()
    for row in rows:
        save_qr_path(row["id"], generate_qr(row))
    return [row["attendee_code"] for row in rows]


def get_attendee_by_code(code):
    return get_db().execute(
        "SELECT * FROM attendees WHERE attendee_code = ?", (code,)
    ).fetchone()


def get_attendee_by_token(token):
    return get_db().execute(
        "SELECT * FROM attendees WHERE ticket_token = ?", (token,)
    ).fetchone()
