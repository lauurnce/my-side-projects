from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from flask import current_app, render_template


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
