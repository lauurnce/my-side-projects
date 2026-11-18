import secrets
from datetime import timedelta

from flask import current_app

from ..clock import stopwatch, utc_timestamp
from ..db import get_db
from ..staging import log_held_back, may_email
from .mailer import build_decision_email, log_unsent, mail_connection
from .registration import ATTENDEE_QUERY

EMAIL_BATCH_SIZE = 25
EMAIL_BATCH_SECONDS = 45
CLAIM_LIFETIME = timedelta(minutes=10)
EMAIL_NAMES = {"accepted": "ticket", "declined": "decline email"}
FAILURE_LOG = "Sending the %s failed for %s"
INTERRUPTED = "(email_status = 'sending' AND email_claimed_at <= %s)"
OWED = {
    "waiting": "email_status = 'pending'",
    "failed": f"(email_status = 'failed' OR {INTERRUPTED})",
    "any": "(email_status <> 'sending' OR email_claimed_at <= %s)",
}


def interrupted_before():
    return utc_timestamp(-CLAIM_LIFETIME)


def claim_emails(event_id, which, attendee_ids):
    owed = OWED[which]
    values = (interrupted_before(),) * owed.count("%s")
    if attendee_ids is not None:
        owed += f" AND id IN ({', '.join(['%s'] * len(attendee_ids))})"
        values += tuple(attendee_ids)
    claim = secrets.token_urlsafe(16)
    db = get_db()
    db.execute(
        "UPDATE attendees SET email_status = 'sending', email_claim = %s, email_claimed_at = %s"
        f" WHERE {owed} AND id IN (SELECT id FROM attendees WHERE event_id = %s AND state <> 'pending'"
        f" AND {owed} ORDER BY id LIMIT %s)",
        (claim, utc_timestamp(), *values, event_id, *values, EMAIL_BATCH_SIZE),
    )
    db.commit()
    return claim


def claimed_attendees(claim):
    return get_db().execute(f"{ATTENDEE_QUERY} WHERE a.email_claim = %s ORDER BY a.id", (claim,)).fetchall()


def still_claimed(attendee_id, claim):
    row = get_db().execute(
        "SELECT 1 FROM attendees WHERE id = %s AND email_claim = %s AND email_status = 'sending'",
        (attendee_id, claim),
    ).fetchone()
    return row is not None


def finish(attendee_id, claim, status):
    db = get_db()
    sent_at = utc_timestamp() if status == "sent" else None
    db.execute(
        "UPDATE attendees SET email_status = %s, email_sent_at = COALESCE(%s, email_sent_at)"
        " WHERE id = %s AND email_claim = %s AND email_status = 'sending'",
        (status, sent_at, attendee_id, claim),
    )
    db.commit()


def fail_unfinished(claim):
    db = get_db()
    db.execute(
        "UPDATE attendees SET email_status = 'failed' WHERE email_claim = %s AND email_status = 'sending'",
        (claim,),
    )
    db.commit()


def release_unfinished(claim):
    db = get_db()
    db.execute(
        "UPDATE attendees SET email_status = 'pending', email_claim = NULL, email_claimed_at = NULL"
        " WHERE email_claim = %s AND email_status = 'sending'",
        (claim,),
    )
    db.commit()


def built_message(attendee, claim):
    try:
        return build_decision_email(attendee)
    except Exception:
        current_app.logger.exception(FAILURE_LOG, EMAIL_NAMES[attendee["state"]], attendee["attendee_code"])
        finish(attendee["id"], claim, "failed")
        return None


def send_one(smtp, attendee, message, claim):
    if not still_claimed(attendee["id"], claim):
        return
    try:
        smtp.send_message(message)
    except Exception:
        current_app.logger.exception(FAILURE_LOG, EMAIL_NAMES[attendee["state"]], attendee["attendee_code"])
        finish(attendee["id"], claim, "failed")
    else:
        finish(attendee["id"], claim, "sent")


def deliver(messages, claim):
    started = stopwatch()
    try:
        with mail_connection() as smtp:
            for attendee, message in messages:
                if stopwatch() - started > EMAIL_BATCH_SECONDS:
                    break
                send_one(smtp, attendee, message, claim)
    except Exception:
        current_app.logger.exception("The mail connection failed before every email in the batch was sent")
        fail_unfinished(claim)


def count_finished(claim):
    rows = get_db().execute(
        "SELECT email_status, COUNT(*) AS total FROM attendees WHERE email_claim = %s GROUP BY email_status",
        (claim,),
    ).fetchall()
    totals = {row["email_status"]: row["total"] for row in rows}
    return {status: totals.get(status, 0) for status in ("sent", "failed", "held")} | {"logged": 0}


def hold_back_outsiders(messages, claim):
    allowed = []
    for attendee, message in messages:
        if may_email(attendee["email"]):
            allowed.append((attendee, message))
            continue
        log_held_back(message["To"], message["Subject"])
        finish(attendee["id"], claim, "held")
    return allowed


def send_emails(event_id, which="waiting", attendee_ids=None):
    if attendee_ids is not None and not attendee_ids:
        return {"sent": 0, "failed": 0, "held": 0, "logged": 0}
    claim = claim_emails(event_id, which, attendee_ids)
    messages = [(attendee, built_message(attendee, claim)) for attendee in claimed_attendees(claim)]
    messages = [(attendee, message) for attendee, message in messages if message is not None]
    if not current_app.config["MAIL_ENABLED"]:
        for _attendee, message in messages:
            log_unsent(message["To"], message["Subject"])
        release_unfinished(claim)
        return {**count_finished(claim), "logged": len(messages)}
    messages = hold_back_outsiders(messages, claim)
    if messages:
        deliver(messages, claim)
    release_unfinished(claim)
    return count_finished(claim)
