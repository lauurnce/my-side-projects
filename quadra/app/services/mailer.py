import smtplib
import ssl
from contextlib import contextmanager
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from flask import current_app, render_template

from .qr import ticket_png


class MailConfigError(Exception):
    pass


STATUS_PATH = "/application/"
ACCOUNT_SUBJECTS = {
    "invite": "You are invited to the Quadra staff team",
    "reset": "Set a new Quadra password",
}


def new_message(subject, recipient):
    config = current_app.config
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((config["MAIL_FROM_NAME"], config["SMTP_USER"]))
    message["To"] = recipient
    return message


def status_url(attendee):
    base = current_app.config["PUBLIC_BASE_URL"].rstrip("/")
    return f"{base}{STATUS_PATH}{attendee['status_token']}"


def decision_subject(attendee):
    if attendee["state"] == "declined":
        return f"Your application: {attendee['event_name']}"
    if attendee["decided_by_id"]:
        return f"You are accepted: {attendee['event_name']}"
    return f"Your ticket: {attendee['event_name']}"


def build_ticket_email(attendee):
    code = attendee["attendee_code"]
    png = ticket_png(attendee)
    qr_cid = make_msgid(domain="quadra.local")
    message = new_message(decision_subject(attendee), attendee["email"])

    context = {"attendee": attendee, "qr_cid": qr_cid[1:-1], "status_url": status_url(attendee)}
    message.set_content(render_template("email/ticket.txt", **context))
    message.add_alternative(render_template("email/ticket.html", **context), subtype="html")
    html_part = message.get_payload()[1]
    html_part.add_related(png, maintype="image", subtype="png", cid=qr_cid, filename=f"{code}.png")
    message.add_attachment(png, maintype="image", subtype="png", filename=f"{code}.png")
    return message


def build_decline_email(attendee):
    message = new_message(decision_subject(attendee), attendee["email"])
    context = {"attendee": attendee, "status_url": status_url(attendee)}
    message.set_content(render_template("email/declined.txt", **context))
    message.add_alternative(render_template("email/declined.html", **context), subtype="html")
    return message


def build_decision_email(attendee):
    if attendee["state"] == "declined":
        return build_decline_email(attendee)
    return build_ticket_email(attendee)


def build_account_email(kind, account, link, hours):
    message = new_message(ACCOUNT_SUBJECTS[kind], account["email"])
    context = {"account": account, "link": link, "hours": hours}
    message.set_content(render_template(f"email/{kind}.txt", **context))
    message.add_alternative(render_template(f"email/{kind}.html", **context), subtype="html")
    return message


@contextmanager
def mail_connection():
    config = current_app.config
    user = config["SMTP_USER"]
    password = config["SMTP_APP_PASSWORD"].replace(" ", "")
    if not user or not password:
        raise MailConfigError("SMTP_USER and SMTP_APP_PASSWORD must be set to send email.")
    with smtplib.SMTP_SSL(
        config["MAIL_SERVER"],
        config["MAIL_PORT"],
        timeout=config["MAIL_TIMEOUT"],
        context=ssl.create_default_context(),
    ) as smtp:
        smtp.login(user, password)
        yield smtp


def log_unsent(recipient, subject):
    current_app.logger.info("MAIL_ENABLED is off, not sending. To: %s | Subject: %s", recipient, subject)


def send_account_email(kind, account, link, hours):
    message = build_account_email(kind, account, link, hours)
    if not current_app.config["MAIL_ENABLED"]:
        log_unsent(message["To"], message["Subject"])
        return False
    with mail_connection() as smtp:
        smtp.send_message(message)
    return True
