from ..db import get_db
from .registration import get_attendee_by_token

CHECKIN_PATH = "/checkin/"


def extract_token(scanned):
    text = (scanned or "").strip()
    if CHECKIN_PATH in text:
        text = text.split(CHECKIN_PATH, 1)[1]
    return text.split("?", 1)[0].split("#", 1)[0].strip("/")


def check_in(token):
    db = get_db()
    marked = db.execute(
        "UPDATE attendees SET checked_in = 1, checked_in_at = datetime('now', 'localtime')"
        " WHERE ticket_token = ? AND checked_in = 0",
        (token,),
    ).rowcount
    db.commit()
    attendee = get_attendee_by_token(token)
    if attendee is None:
        return "invalid", None
    return ("checked_in" if marked else "already"), attendee
