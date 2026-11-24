import secrets
import time

from flask import current_app

from ..clock import utc_timestamp
from ..db import get_db
from .mailer import send_ticket_email


class DuplicateEmailError(Exception):
    pass


ATTENDEE_QUERY = (
    "SELECT a.*, e.name AS event_name, e.event_date AS event_date,"
    " e.venue AS event_venue, e.slug AS event_slug"
    " FROM attendees a JOIN events e ON e.id = a.event_id"
)


def email_exists(event_id, email):
    row = get_db().execute(
        "SELECT 1 FROM attendees WHERE event_id = ? AND email = ?", (event_id, email.lower())
    ).fetchone()
    return row is not None


def create_attendee(event_id, full_name, email, organization, contact_number):
    db = get_db()
    email = email.lower()
    token = secrets.token_urlsafe(32)
    prefix = current_app.config["ATTENDEE_CODE_PREFIX"]

    inserted = db.execute(
        "INSERT INTO attendees"
        " (event_id, attendee_code, full_name, email, organization, contact_number,"
        " ticket_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT (event_id, email) DO NOTHING RETURNING id",
        (
            event_id,
            f"PENDING-{token}",
            full_name,
            email,
            organization,
            contact_number,
            token,
            utc_timestamp(),
        ),
    ).fetchall()
    if not inserted:
        db.rollback()
        raise DuplicateEmailError(email)
    attendee_id = inserted[0]["id"]
    code = f"{prefix}-{attendee_id:04d}"
    db.execute("UPDATE attendees SET attendee_code = ? WHERE id = ?", (code, attendee_id))
    db.commit()

    return deliver_ticket(get_attendee_by_code(code))


def save_email_status(attendee_id, status):
    db = get_db()
    if status == "sent":
        db.execute(
            "UPDATE attendees SET email_status = ?, email_sent_at = ? WHERE id = ?",
            (status, utc_timestamp(), attendee_id),
        )
    else:
        db.execute("UPDATE attendees SET email_status = ? WHERE id = ?", (status, attendee_id))
    db.commit()


def deliver_ticket(attendee):
    code = attendee["attendee_code"]
    started = time.perf_counter()
    try:
        sent = send_ticket_email(attendee)
    except Exception:
        current_app.logger.exception("Ticket email failed for %s", code)
        save_email_status(attendee["id"], "failed")
    else:
        if sent:
            current_app.logger.info(
                "Ticket email for %s sent in %.2fs", code, time.perf_counter() - started
            )
            save_email_status(attendee["id"], "sent")
    return get_attendee_by_code(code)


def get_attendee_by_code(code):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.attendee_code = ?", (code,)).fetchone()


def get_attendee_by_token(token):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.ticket_token = ?", (token,)).fetchone()


def get_attendee_by_id(attendee_id):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.id = ?", (attendee_id,)).fetchone()
