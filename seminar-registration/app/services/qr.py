import qrcode
from flask import current_app
from qrcode.constants import ERROR_CORRECT_Q

BOX_SIZE = 10
BORDER = 4  # quiet zone in modules, the minimum the QR spec asks for


def checkin_url(ticket_token):
    """Return the URL encoded in an attendee's ticket QR code."""
    base = current_app.config["PUBLIC_BASE_URL"].rstrip("/")
    return f"{base}/checkin/{ticket_token}"


def build_qr_image(data):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=BOX_SIZE, border=BORDER)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")
