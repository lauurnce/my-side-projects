from ..db import get_db
from .registration import get_attendee_by_token


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
