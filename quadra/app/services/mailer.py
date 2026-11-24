import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from flask import current_app, render_template


class MailConfigError(Exception):
    pass


def build_ticket_email(attendee):
    config = current_app.config
    code = attendee["attendee_code"]
    png = Path(attendee["qr_path"]).read_bytes()
    qr_cid = make_msgid(domain="seminar-registration.local")

    message = EmailMessage()
    message["Subject"] = f"Your ticket: {attendee['event_name']}"
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
        smtp.send_message(message)


def send_ticket_email(attendee):
    message = build_ticket_email(attendee)
    if not current_app.config["MAIL_ENABLED"]:
        current_app.logger.info(
            "MAIL_ENABLED is off, not sending. To: %s | Subject: %s\n%s",
            message["To"],
            message["Subject"],
            message.get_body(("plain",)).get_content(),
        )
        return False
    send_message(message)
    return True
