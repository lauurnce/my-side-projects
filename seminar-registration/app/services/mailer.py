from email.message import EmailMessage
from email.utils import formataddr

from flask import current_app, render_template


def build_ticket_email(attendee):
    """Build the ticket email for an attendee."""
    config = current_app.config

    message = EmailMessage()
    message["Subject"] = f"Your ticket: {config['EVENT_NAME']}"
    message["From"] = formataddr((config["MAIL_FROM_NAME"], config["SMTP_USER"]))
    message["To"] = attendee["email"]

    context = {"attendee": attendee}
    message.set_content(render_template("email/ticket.txt", **context))
    return message
