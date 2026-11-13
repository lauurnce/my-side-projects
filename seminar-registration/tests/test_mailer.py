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
