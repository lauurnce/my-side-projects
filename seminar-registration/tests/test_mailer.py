import smtplib

import pytest

from app.db import get_db


class FakeSMTP:
    """Stands in for smtplib.SMTP_SSL and records what would have been sent."""

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.login_args = None
        self.sent = []
        self.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def login(self, user, password):
        self.login_args = (user, password)

    def send_message(self, message):
        self.sent.append(message)


@pytest.fixture
def fake_smtp(app, monkeypatch):
    app.config.update(
        MAIL_ENABLED=True,
        SMTP_USER="organizer@gmail.com",
        SMTP_APP_PASSWORD="abcd efgh ijkl mnop",
        MAIL_FROM_NAME="Seminar Team",
    )
    smtp_class = type("FakeSMTPForTest", (FakeSMTP,), {"instances": []})
    monkeypatch.setattr(smtplib, "SMTP_SSL", smtp_class)
    return smtp_class


def get_row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = ?", (email,)).fetchone()


def sent_message(fake_smtp):
    assert len(fake_smtp.instances) == 1
    assert len(fake_smtp.instances[0].sent) == 1
    return fake_smtp.instances[0].sent[0]


def test_email_sent_on_registration_marks_sent(client, app, valid_form, fake_smtp):
    client.post("/register", data=valid_form)
    sent_message(fake_smtp)
    row = get_row(app)
    assert row["email_status"] == "sent"
    assert row["email_sent_at"]


def test_connects_to_gmail_over_ssl_with_timeout(client, valid_form, fake_smtp):
    client.post("/register", data=valid_form)
    smtp = fake_smtp.instances[0]
    assert (smtp.host, smtp.port, smtp.timeout) == ("smtp.gmail.com", 465, 15)
    assert smtp.login_args == ("organizer@gmail.com", "abcdefghijklmnop")


def test_subject_sender_and_recipient(client, valid_form, fake_smtp):
    client.post("/register", data=valid_form)
    message = sent_message(fake_smtp)
    assert message["Subject"] == "Your ticket: Test Seminar"
    assert message["To"] == "juan@example.com"
    assert message["From"] == "Seminar Team <organizer@gmail.com>"


def test_html_shows_qr_inline_through_cid(client, valid_form, fake_smtp):
    client.post("/register", data=valid_form)
    message = sent_message(fake_smtp)
    html_part = message.get_body(("html",))
    html = html_part.get_content()
    related = [part for part in message.walk() if part.get("Content-ID")]
    assert len(related) == 1
    cid = related[0]["Content-ID"].strip("<>")
    assert f'src="cid:{cid}"' in html
    assert related[0].get_content_type() == "image/png"
    assert "data:image" not in html


def test_html_has_event_details_and_check_in_line(client, valid_form, fake_smtp):
    client.post("/register", data=valid_form)
    html = sent_message(fake_smtp).get_body(("html",)).get_content()
    for text in ("Hi Juan Dela Cruz", "Test Seminar", "November 30, 2026", "Main Hall",
                 "SEM-2026-0001", "Show this QR code at the check-in desk."):
        assert text in html


def test_plain_text_alternative_exists(client, valid_form, fake_smtp):
    client.post("/register", data=valid_form)
    text = sent_message(fake_smtp).get_body(("plain",)).get_content()
    assert "Hi Juan Dela Cruz" in text
    assert "SEM-2026-0001" in text
    assert "Show this QR code at the check-in desk." in text
