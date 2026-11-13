import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from flask import current_app, render_template


class MailConfigError(Exception):
    """Raised when sending is enabled but the SMTP settings are incomplete."""


def build_ticket_email(attendee):
    """Build the ticket email: plain text + HTML with an inline cid QR, plus the PNG attached."""
    config = current_app.config
    code = attendee["attendee_code"]
    png = Path(attendee["qr_path"]).read_bytes()
    qr_cid = make_msgid(domain="seminar-registration.local")

    message = EmailMessage()
    message["Subject"] = f"Your ticket: {config['EVENT_NAME']}"
    message["From"] = formataddr((config["MAIL_FROM_NAME"], config["SMTP_USER"]))
    message["To"] = attendee["email"]

    context = {"attendee": attendee, "qr_cid": qr_cid[1:-1]}
    message.set_content(render_template("email/ticket.txt", **context))
    message.add_alternative(render_template("email/ticket.html", **context), subtype="html")
    html_part = message.get_payload()[1]
    html_part.add_related(png, maintype="image", subtype="png", cid=qr_cid, filename=f"{code}.png")
    message.add_attachment(png, maintype="image", subtype="png", filename=f"{code}.png")
    return message


def send_message(message):
    config = current_app.config
    user = config["SMTP_USER"]
    password = config["SMTP_APP_PASSWORD"].replace(" ", "")  # Google shows it in groups of four
    if not user or not password:
        raise MailConfigError("SMTP_USER and SMTP_APP_PASSWORD must be set to send email.")
    with smtplib.SMTP_SSL(
        config["MAIL_SERVER"],
        config["MAIL_PORT"],
        timeout=config["MAIL_TIMEOUT"],
        context=ssl.create_default_context(),
    ) as smtp:
        smtp.login(user, password)
        smtp.send_message(message)
