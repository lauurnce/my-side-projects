from ..clock import utc_timestamp
from ..db import get_db

STATES = ("pending", "accepted", "declined")
DECISIONS = {"accept": "accepted", "decline": "declined"}


def decide(event_id, state, account_id, attendee_ids=None):
    if attendee_ids is not None and not attendee_ids:
        return []
    chosen, values = "state = 'pending'", ()
    if attendee_ids is not None:
        chosen, values = f"id IN ({', '.join(['%s'] * len(attendee_ids))})", tuple(attendee_ids)
    still_outside = " AND checked_in = 0" if state == "declined" else ""
    db = get_db()
    decided = db.execute(
        "UPDATE attendees SET state = %s, decided_at = %s, decided_by_id = %s,"
        " email_status = 'pending', email_claim = NULL, email_claimed_at = NULL"
        f" WHERE event_id = %s AND state <> %s AND {chosen}{still_outside} RETURNING id",
        (state, utc_timestamp(), account_id, event_id, state, *values),
    ).fetchall()
    db.commit()
    return [row["id"] for row in decided]
