import secrets
from datetime import timedelta

from flask import current_app

from ..clock import utc_timestamp
from ..db import get_db
from .accounts import address_key

MAX_APPLICATIONS_PER_ADDRESS = 30
APPLICATION_WINDOW = timedelta(hours=1)


class DuplicateEmailError(Exception):
    pass


ATTENDEE_QUERY = (
    "SELECT a.*, e.name AS event_name, e.event_date AS event_date,"
    " e.venue AS event_venue, e.slug AS event_slug, c.name AS checked_in_by, d.name AS decided_by"
    " FROM attendees a JOIN events e ON e.id = a.event_id"
    " LEFT JOIN accounts c ON c.id = a.checked_in_by_id"
    " LEFT JOIN accounts d ON d.id = a.decided_by_id"
)


def email_exists(event_id, email):
    row = get_db().execute(
        "SELECT 1 FROM attendees WHERE event_id = %s AND email = %s", (event_id, email.lower())
    ).fetchone()
    return row is not None


def may_apply(remote_addr):
    db = get_db()
    db.execute(
        "DELETE FROM application_attempts WHERE window_started_at <= %s",
        (utc_timestamp(-APPLICATION_WINDOW),),
    )
    applications = db.execute(
        "INSERT INTO application_attempts (address, applications, window_started_at) VALUES (%s, 1, %s)"
        " ON CONFLICT (address) DO UPDATE SET applications = application_attempts.applications + 1"
        " RETURNING applications",
        (address_key(remote_addr), utc_timestamp()),
    ).fetchall()[0]["applications"]
    db.commit()
    return applications <= MAX_APPLICATIONS_PER_ADDRESS


def create_attendee(event_id, full_name, email, organization, contact_number, state="accepted"):
    db = get_db()
    email = email.lower()
    token = secrets.token_urlsafe(32)
    prefix = current_app.config["ATTENDEE_CODE_PREFIX"]
    accepted = state == "accepted"
    now = utc_timestamp()

    inserted = db.execute(
        "INSERT INTO attendees"
        " (event_id, attendee_code, full_name, email, organization, contact_number,"
        " ticket_token, status_token, state, decided_at, email_status, created_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
        " ON CONFLICT (event_id, email) DO NOTHING RETURNING id",
        (
            event_id,
            f"PENDING-{token}",
            full_name,
            email,
            organization,
            contact_number,
            token,
            secrets.token_urlsafe(32),
            state,
            now if accepted else None,
            "pending" if accepted else "none",
            now,
        ),
    ).fetchall()
    if not inserted:
        db.rollback()
        raise DuplicateEmailError(email)
    attendee_id = inserted[0]["id"]
    code = f"{prefix}-{attendee_id:04d}"
    db.execute("UPDATE attendees SET attendee_code = %s WHERE id = %s", (code, attendee_id))
    db.commit()
    return get_attendee_by_code(code)


def get_attendee_by_code(code):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.attendee_code = %s", (code,)).fetchone()


def get_attendee_by_token(token):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.ticket_token = %s", (token,)).fetchone()


def get_attendee_by_status_token(token):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.status_token = %s", (token,)).fetchone()


def get_attendee_by_id(attendee_id):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.id = %s", (attendee_id,)).fetchone()
