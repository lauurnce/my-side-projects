from flask import current_app


def checkin_url(ticket_token):
    """Return the URL encoded in an attendee's ticket QR code."""
    base = current_app.config["PUBLIC_BASE_URL"].rstrip("/")
    return f"{base}/checkin/{ticket_token}"
