from ..clock import utc_timestamp
from ..db import get_db
from .delivery import INTERRUPTED, interrupted_before
from .registration import ATTENDEE_QUERY, get_attendee_by_token

CHECKIN_PATH = "/checkin/"
SEARCH_COLUMNS = ("attendee_code", "full_name", "email", "organization", "contact_number")


def extract_token(scanned):
    text = (scanned or "").strip()
    if CHECKIN_PATH in text:
        text = text.split(CHECKIN_PATH, 1)[1]
    return text.split("?", 1)[0].split("#", 1)[0].strip("/")


def check_in(token, account_id):
    db = get_db()
    marked = db.execute(
        "UPDATE attendees SET checked_in = 1, checked_in_at = %s, checked_in_by_id = %s"
        " WHERE ticket_token = %s AND checked_in = 0 AND state = 'accepted'",
        (utc_timestamp(), account_id, token),
    ).rowcount
    db.commit()
    attendee = get_attendee_by_token(token)
    if attendee is None:
        return "invalid", None
    if attendee["state"] != "accepted":
        return "not_accepted", attendee
    return ("checked_in" if marked else "already"), attendee


def count_of(condition, name):
    return f" COALESCE(SUM(CASE WHEN {condition} THEN 1 ELSE 0 END), 0) AS {name},"


def totals(event_id):
    return get_db().execute(
        "SELECT COUNT(*) AS registered,"
        + count_of("state = 'pending'", "pending")
        + count_of("state = 'accepted'", "accepted")
        + count_of("state = 'declined'", "declined")
        + count_of("email_status = 'sent'", "emails_sent")
        + count_of("email_status = 'pending' AND state <> 'pending'", "emails_waiting")
        + count_of(f"state <> 'pending' AND (email_status = 'failed' OR {INTERRUPTED})", "emails_failed")
        + " COALESCE(SUM(checked_in), 0) AS checked_in"
        " FROM attendees WHERE event_id = %s",
        (interrupted_before(), event_id),
    ).fetchone()


def containing(text):
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search_attendees(event_id, query="", state=""):
    query = query.strip()
    wanted, values = "a.event_id = %s", [event_id]
    if state:
        wanted += " AND a.state = %s"
        values.append(state)
    if query:
        matches = " OR ".join(
            f"lower(a.{column}) LIKE lower(%s) ESCAPE '\\'" for column in SEARCH_COLUMNS
        )
        wanted += f" AND ({matches})"
        values += [containing(query)] * len(SEARCH_COLUMNS)
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE {wanted} ORDER BY a.id", values).fetchall()
