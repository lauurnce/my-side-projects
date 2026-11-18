import re
from email.utils import getaddresses

from flask import current_app

from . import security

ENVIRONMENTS = ("", "development", "staging", "production")
NO_INDEX = "noindex, nofollow"
SUBJECT_MARK = "[Test copy] "
RECIPIENT_HEADERS = ("To", "Cc", "Bcc")


class HeldBackError(Exception):
    pass


def without_plus_tag(address):
    mailbox, _, domain = address.rpartition("@")
    return f"{mailbox.split('+', 1)[0]}@{domain}"


def allowlist():
    entries = re.split(r"[,;\s]+", current_app.config["STAGING_MAIL_ALLOWLIST"].lower())
    return {entry for entry in entries if entry}


def may_email(address):
    if not current_app.config["STAGING"]:
        return True
    address = address.strip().lower()
    return bool({address, without_plus_tag(address)} & allowlist())


def log_held_back(recipient, subject):
    current_app.logger.warning("Staging held back an email. To: %s | Subject: %s", recipient, subject)


def marked_subject(subject):
    return SUBJECT_MARK + subject if current_app.config["STAGING"] else subject


def recipients(message):
    headers = [value for name in RECIPIENT_HEADERS for value in message.get_all(name, [])]
    return [address for _name, address in getaddresses(headers)]


class AllowlistedSMTP:
    def __init__(self, smtp):
        self.smtp = smtp

    def send_message(self, message):
        addresses = recipients(message)
        if not addresses or not all(may_email(address) for address in addresses):
            raise HeldBackError(f"Staging does not email {', '.join(addresses) or 'nobody'}.")
        return self.smtp.send_message(message)


def allowlisted(smtp):
    return AllowlistedSMTP(smtp) if current_app.config["STAGING"] else smtp


def require_one_environment(app):
    config = app.config
    if config["QUADRA_ENV"] not in ENVIRONMENTS:
        raise RuntimeError(
            f"QUADRA_ENV is {config['QUADRA_ENV']!r}. Use production, staging, or leave it empty."
        )
    if config["STAGING"] and config["PRODUCTION"]:
        raise RuntimeError("Staging and production are both switched on. Pick one with QUADRA_ENV.")
    if config["PRODUCTION"] and config["STAGING_MAIL_ALLOWLIST"].strip():
        raise RuntimeError(
            "STAGING_MAIL_ALLOWLIST is set on a production site."
            " Remove it, or set QUADRA_ENV=staging if this is the test copy."
        )


def init_app(app):
    require_one_environment(app)
    if not app.config["STAGING"]:
        return
    security.harden_for_production(app)

    @app.after_request
    def keep_the_test_copy_out_of_search(response):
        response.headers["X-Robots-Tag"] = NO_INDEX
        response.headers["Strict-Transport-Security"] = security.HSTS
        return response
