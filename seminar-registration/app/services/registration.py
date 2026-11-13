import os
import secrets
import sqlite3

from flask import current_app

from ..db import get_db
from .mailer import send_ticket_email
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

    # On new entry: build the ticket QR right after the insert, then email it.
    return deliver_ticket(attach_qr(get_attendee_by_code(code)))


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


def save_email_status(attendee_id, status):
    db = get_db()
    if status == "sent":
        db.execute(
            "UPDATE attendees SET email_status = ?, email_sent_at = datetime('now', 'localtime')"
            " WHERE id = ?",
            (status, attendee_id),
        )
    else:
        db.execute("UPDATE attendees SET email_status = ? WHERE id = ?", (status, attendee_id))
    db.commit()


def deliver_ticket(attendee):
    """Email the ticket and record email_status and email_sent_at.

    A failed email is logged and marked 'failed'; the registration is kept.
    With MAIL_ENABLED off the email is only logged and the status stays as it was.
    """
    if not attendee["qr_path"] or not os.path.isfile(attendee["qr_path"]):
        attendee = attach_qr(attendee)
    code = attendee["attendee_code"]
    try:
        sent = send_ticket_email(attendee)
    except Exception:
        current_app.logger.exception("Ticket email failed for %s", code)
        save_email_status(attendee["id"], "failed")
    else:
        if sent:
            save_email_status(attendee["id"], "sent")
    return get_attendee_by_code(code)


def regenerate_qr_codes(code=None):
    """Rebuild ticket QR images for every attendee, or one attendee code.

    Returns the list of attendee codes that were rebuilt.
    """
    if code:
        rows = get_db().execute(
            "SELECT * FROM attendees WHERE attendee_code = ?", (code,)
        ).fetchall()
    else:
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
