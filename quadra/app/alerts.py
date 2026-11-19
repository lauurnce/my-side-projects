import secrets
import sqlite3
import threading
from datetime import timedelta

import psycopg
from flask import current_app, g, got_request_exception, request

from .clock import MANILA, utc_now, utc_timestamp
from .db import get_db
from .services import mailer

ALERT_WINDOW = timedelta(hours=1)
MAX_ALERTS_PER_WINDOW = 5
ALERT_TIMEOUT_SECONDS = 6
MAX_KIND_LENGTH = 200
UNMATCHED_PATH = "(no matching route)"
NO_REFERENCE = "none"
NOT_COUNTED = "not counted, because the alert table could not be used"
LAST_UNCOUNTED_ALERT = "last_uncounted_alert_at"
DATABASE_IS_DOWN = (sqlite3.OperationalError, psycopg.OperationalError)


def redacted_path():
    return request.url_rule.rule if request.url_rule else UNMATCHED_PATH


def count_suppressed(db, kind):
    db.execute(
        "INSERT INTO error_alerts (kind, last_sent_at, suppressed) VALUES (%s, '', 1)"
        " ON CONFLICT (kind) DO UPDATE SET suppressed = error_alerts.suppressed + 1",
        (kind,),
    )
    db.commit()


def claim_in_table(db, kind):
    db.rollback()
    cutoff = utc_timestamp(-ALERT_WINDOW)
    recent = db.execute(
        "SELECT COUNT(*) AS sent, COALESCE(SUM(CASE WHEN kind = %s THEN 1 ELSE 0 END), 0) AS same_kind"
        " FROM error_alerts WHERE last_sent_at > %s",
        (kind, cutoff),
    ).fetchone()
    if recent["same_kind"] or recent["sent"] >= MAX_ALERTS_PER_WINDOW:
        count_suppressed(db, kind)
        return None
    earlier = db.execute("SELECT suppressed FROM error_alerts WHERE kind = %s", (kind,)).fetchone()
    claimed = db.execute(
        "INSERT INTO error_alerts (kind, last_sent_at, suppressed) VALUES (%s, %s, 0)"
        " ON CONFLICT (kind) DO UPDATE SET last_sent_at = excluded.last_sent_at, suppressed = 0"
        " WHERE error_alerts.last_sent_at <= %s RETURNING kind",
        (kind, utc_timestamp(), cutoff),
    ).fetchall()
    db.commit()
    if not claimed:
        return None
    return str(earlier["suppressed"] if earlier else 0)


def claim_in_memory():
    memory = current_app.extensions["alerts"]
    last = memory.get(LAST_UNCOUNTED_ALERT)
    if last is not None and utc_now() - last < ALERT_WINDOW:
        return None
    memory[LAST_UNCOUNTED_ALERT] = utc_now()
    return NOT_COUNTED


def claim_in_database(kind):
    db = get_db()
    try:
        return claim_in_table(db, kind)
    except Exception:
        db.rollback()
        raise


def claim(kind, database_works):
    if not database_works:
        return claim_in_memory()
    try:
        return claim_in_database(kind)
    except Exception:
        current_app.logger.warning("The alert table could not be used, so this instance limits alerts itself.", exc_info=True)
        return claim_in_memory()


def alert_message(what, reference, suppressed):
    message = mailer.new_message(f"[Quadra alert] {what}", current_app.config["ALERT_EMAIL"])
    message.set_content(
        "\n".join([
            "Quadra reported a problem.",
            "",
            f"What: {what}",
            f"When: {utc_now().astimezone(MANILA):%Y-%m-%d %H:%M:%S} Manila time",
            f"Reference: {reference}",
            f"Same problem since the last alert about it: {suppressed}",
            "",
            "Search the Vercel logs for the reference to find the request and its traceback.",
            f"No more alerts about this problem are sent for {ALERT_WINDOW // timedelta(minutes=1)} minutes.",
            "What to do is in docs/RUNBOOK.md under Alerts.",
        ])
    )
    return message


def send_quietly(app, message):
    try:
        with app.app_context(), mailer.mail_connection(timeout=ALERT_TIMEOUT_SECONDS) as smtp:
            smtp.send_message(message)
    except Exception:
        app.logger.warning("The alert email was not sent.", exc_info=True)


def send_within_timeout(message):
    app = current_app._get_current_object()
    sender = threading.Thread(target=send_quietly, args=(app, message), daemon=True)
    sender.start()
    sender.join(ALERT_TIMEOUT_SECONDS)
    if sender.is_alive():
        app.logger.warning("Alert email took over %s seconds, so the request stopped waiting.", ALERT_TIMEOUT_SECONDS)


def send_alert(what, reference, database_works):
    if not current_app.config["ALERT_EMAIL"]:
        return
    suppressed = claim(what[:MAX_KIND_LENGTH], database_works)
    if suppressed is None:
        return
    message = alert_message(what, reference, suppressed)
    if not current_app.config["MAIL_ENABLED"]:
        mailer.log_unsent(message["To"], message["Subject"])
        return
    send_within_timeout(message)


def notify(what, reference=NO_REFERENCE, database_works=True):
    try:
        send_alert(what, reference, database_works)
    except Exception:
        current_app.logger.warning("The alert was skipped.", exc_info=True)


def report_unhandled_error(app, exception, **_signal):
    reference = secrets.token_hex(4)
    g.error_reference = reference
    what = f"{type(exception).__name__} on {request.method} {redacted_path()}"
    app.logger.error("Unhandled error reference=%s: %s", reference, what)
    notify(what, reference, database_works=not isinstance(exception, DATABASE_IS_DOWN))


def init_app(app):
    app.extensions["alerts"] = {}
    got_request_exception.connect(report_unhandled_error, app)
