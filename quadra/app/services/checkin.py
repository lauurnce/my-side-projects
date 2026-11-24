from ..clock import utc_timestamp
from ..db import get_db
from .registration import ATTENDEE_QUERY, get_attendee_by_token

CHECKIN_PATH = "/checkin/"
SEARCH_COLUMNS = ("attendee_code", "full_name", "email", "organization", "contact_number")


def extract_token(scanned):
    text = (scanned or "").strip()
    if CHECKIN_PATH in text:
        text = text.split(CHECKIN_PATH, 1)[1]
    return text.split("?", 1)[0].split("#", 1)[0].strip("/")


def check_in(token):
    db = get_db()
    marked = db.execute(
        "UPDATE attendees SET checked_in = 1, checked_in_at = ?"
        " WHERE ticket_token = ? AND checked_in = 0",
        (utc_timestamp(), token),
    ).rowcount
    db.commit()
    attendee = get_attendee_by_token(token)
    if attendee is None:
        return "invalid", None
    return ("checked_in" if marked else "already"), attendee


def totals(event_id):
    return get_db().execute(
        "SELECT COUNT(*) AS registered,"
        " COALESCE(SUM(email_status = 'sent'), 0) AS emails_sent,"
        " COALESCE(SUM(checked_in), 0) AS checked_in"
        " FROM attendees WHERE event_id = ?",
        (event_id,),
    ).fetchone()


def search_attendees(event_id, query=""):
    query = query.strip()
    if not query:
        return get_db().execute(
            f"{ATTENDEE_QUERY} WHERE a.event_id = ? ORDER BY a.id", (event_id,)
        ).fetchall()
    matches = " OR ".join(f"instr(lower(a.{column}), lower(?)) > 0" for column in SEARCH_COLUMNS)
    return get_db().execute(
        f"{ATTENDEE_QUERY} WHERE a.event_id = ? AND ({matches}) ORDER BY a.id",
        (event_id, *(query,) * len(SEARCH_COLUMNS)),
    ).fetchall()
