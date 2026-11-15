import hashlib
import ipaddress
import math
import secrets
from datetime import datetime, timedelta
from functools import cache

from flask import current_app
from werkzeug.security import check_password_hash, generate_password_hash

from ..clock import utc_now, utc_timestamp
from ..db import get_db
from ..validation import EMAIL_RE
from .mailer import send_account_email

MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 200
MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 254
MAX_FAILED_LOGINS = 5
MAX_FAILED_LOGINS_PER_EMAIL = 20
UNKNOWN_ADDRESS = "unknown"
IPV6_SUBSCRIBER_PREFIX = 64
LOCK_TIME = timedelta(minutes=15)
LINK_LIFETIMES = {"invite": timedelta(hours=72), "reset": timedelta(hours=1)}
FORGOT_COOLDOWN = timedelta(minutes=5)
SET_PASSWORD_PATH = "/staff/set-password/"


class DuplicateAccountError(Exception):
    pass


def normalize_email(raw):
    return (raw or "").strip().lower()


def email_problem(email):
    if not email:
        return "Email address is required."
    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_RE.match(email):
        return "Enter a valid email address, like name@example.com."
    return None


def name_problem(name):
    if not name:
        return "Your name is required."
    if len(name) > MAX_NAME_LENGTH:
        return f"Your name must be at most {MAX_NAME_LENGTH} characters."
    return None


def password_problem(password, confirmation):
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Use at most {MAX_PASSWORD_LENGTH} characters."
    if password != confirmation:
        return "The two passwords do not match."
    return None


def get_account(account_id):
    return get_db().execute("SELECT * FROM accounts WHERE id = %s", (account_id,)).fetchone()


def get_account_by_email(email):
    return get_db().execute(
        "SELECT * FROM accounts WHERE email = %s", (normalize_email(email),)
    ).fetchone()


def list_accounts():
    return get_db().execute("SELECT * FROM accounts ORDER BY role DESC, id").fetchall()


def create_account(email, role, name=""):
    db = get_db()
    now = utc_timestamp()
    inserted = db.execute(
        "INSERT INTO accounts (email, name, role, created_at, updated_at)"
        " VALUES (%s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING RETURNING id",
        (normalize_email(email), name, role, now, now),
    ).fetchall()
    if not inserted:
        db.rollback()
        raise DuplicateAccountError(email)
    db.commit()
    return get_account(inserted[0]["id"])


@cache
def decoy_hash():
    return generate_password_hash(secrets.token_urlsafe(16))


def password_matches(account, password):
    has_password = bool(account and account["password_hash"])
    stored = account["password_hash"] if has_password else decoy_hash()
    return check_password_hash(stored, password) and has_password


def account_for_login(email, password):
    account = get_account_by_email(email)
    if password_matches(account, password) and account["active"]:
        return account
    return None


def address_key(remote_addr):
    try:
        address = ipaddress.ip_address(remote_addr or "")
    except ValueError:
        return UNKNOWN_ADDRESS
    if address.version == 6 and address.ipv4_mapped:
        address = address.ipv4_mapped
    if address.version == 4:
        return str(address)
    return str(ipaddress.ip_network((address, IPV6_SUBSCRIBER_PREFIX), strict=False))


def last_counted_failure(email, address):
    recent = get_db().execute(
        "SELECT COALESCE(SUM(failures), 0) AS email_failures, MAX(last_failed_at) AS email_latest,"
        " COALESCE(SUM(CASE WHEN address = %s THEN failures ELSE 0 END), 0) AS address_failures,"
        " MAX(CASE WHEN address = %s THEN last_failed_at END) AS address_latest"
        " FROM login_attempts WHERE email = %s AND last_failed_at > %s",
        (address, address, email, utc_timestamp(-LOCK_TIME)),
    ).fetchone()
    if recent["address_failures"] >= MAX_FAILED_LOGINS:
        return recent["address_latest"]
    if recent["email_failures"] >= MAX_FAILED_LOGINS_PER_EMAIL:
        return recent["email_latest"]
    return None


def lock_seconds_left(email, address):
    latest = last_counted_failure(email, address)
    if latest is None:
        return 0
    unlocks_at = datetime.fromisoformat(latest) + LOCK_TIME
    return max(0, math.ceil((unlocks_at - utc_now()).total_seconds()))


def record_failed_login(email, address):
    db = get_db()
    db.execute("DELETE FROM login_attempts WHERE last_failed_at <= %s", (utc_timestamp(-LOCK_TIME),))
    db.execute(
        "INSERT INTO login_attempts (email, address, failures, last_failed_at) VALUES (%s, %s, 1, %s)"
        " ON CONFLICT (email, address) DO UPDATE SET failures = login_attempts.failures + 1,"
        " last_failed_at = excluded.last_failed_at",
        (email, address, utc_timestamp()),
    )
    db.commit()


def record_login(account, address):
    db = get_db()
    db.execute(
        "DELETE FROM login_attempts WHERE email = %s AND address = %s", (account["email"], address)
    )
    db.execute("UPDATE accounts SET last_login_at = %s WHERE id = %s", (utc_timestamp(), account["id"]))
    db.commit()


def end_sessions(account_id):
    db = get_db()
    db.execute("UPDATE accounts SET session_version = session_version + 1 WHERE id = %s", (account_id,))
    db.commit()


def save_password(account_id, password, name=None):
    return get_db().execute(
        "UPDATE accounts SET password_hash = %s, name = COALESCE(%s, name),"
        " session_version = session_version + 1, updated_at = %s"
        " WHERE id = %s RETURNING session_version",
        (generate_password_hash(password), name, utc_timestamp(), account_id),
    ).fetchall()[0]["session_version"]


def change_password(account_id, password):
    session_version = save_password(account_id, password)
    get_db().commit()
    return session_version


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_link(account_id, purpose):
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("DELETE FROM account_tokens WHERE account_id = %s", (account_id,))
    db.execute(
        "INSERT INTO account_tokens (account_id, purpose, token_hash, expires_at, created_at)"
        " VALUES (%s, %s, %s, %s, %s)",
        (account_id, purpose, token_hash(token), utc_timestamp(LINK_LIFETIMES[purpose]), utc_timestamp()),
    )
    db.commit()
    base = current_app.config["PUBLIC_BASE_URL"].rstrip("/")
    return f"{base}{SET_PASSWORD_PATH}{token}"


def account_for_link(token):
    return get_db().execute(
        "SELECT a.*, t.purpose AS link_purpose FROM account_tokens t"
        " JOIN accounts a ON a.id = t.account_id"
        " WHERE t.token_hash = %s AND t.used_at IS NULL AND t.expires_at > %s AND a.active = 1",
        (token_hash(token), utc_timestamp()),
    ).fetchone()


def use_link(token, password, name=None):
    account = account_for_link(token)
    if account is None:
        return None
    db = get_db()
    now = utc_timestamp()
    used = db.execute(
        "UPDATE account_tokens SET used_at = %s"
        " WHERE token_hash = %s AND used_at IS NULL AND expires_at > %s",
        (now, token_hash(token), now),
    ).rowcount
    if not used:
        db.rollback()
        return None
    save_password(account["id"], password, name)
    db.execute("DELETE FROM login_attempts WHERE email = %s", (account["email"],))
    db.commit()
    return account


def link_purpose(account):
    return "reset" if account["password_hash"] else "invite"


def mail_is_off_in_production():
    return current_app.config["PRODUCTION"] and not current_app.config["MAIL_ENABLED"]


def email_link(account):
    if mail_is_off_in_production():
        return "off"
    purpose = link_purpose(account)
    link = issue_link(account["id"], purpose)
    hours = LINK_LIFETIMES[purpose] // timedelta(hours=1)
    try:
        sent = send_account_email(purpose, account, link, hours)
    except Exception:
        current_app.logger.exception("The %s email for account %s failed", purpose, account["id"])
        return "failed"
    if sent:
        return "sent"
    current_app.logger.info("Set-password link for %s: %s", account["email"], link)
    return "logged"


def emailed_recently(account_id):
    row = get_db().execute(
        "SELECT 1 FROM account_tokens WHERE account_id = %s AND created_at > %s",
        (account_id, utc_timestamp(-FORGOT_COOLDOWN)),
    ).fetchone()
    return row is not None


def email_forgotten_password_link(email):
    account = get_account_by_email(email)
    if account is None or not account["active"] or emailed_recently(account["id"]):
        return
    email_link(account)


def disable_account(account_id):
    db = get_db()
    disabled = db.execute(
        "UPDATE accounts SET active = 0, session_version = session_version + 1, updated_at = %s"
        " WHERE id = %s AND active = 1 AND (role <> 'owner' OR"
        " (SELECT COUNT(*) FROM accounts WHERE role = 'owner' AND active = 1) > 1)",
        (utc_timestamp(), account_id),
    ).rowcount
    if disabled:
        db.execute("DELETE FROM account_tokens WHERE account_id = %s", (account_id,))
    db.commit()
    return bool(disabled)


def enable_account(account_id):
    db = get_db()
    db.execute(
        "UPDATE accounts SET active = 1, updated_at = %s WHERE id = %s", (utc_timestamp(), account_id)
    )
    db.commit()
