import smtplib

import pytest

from app.db import get_db
from app.services import mailer
from app.services.qr import ticket_png


class FakeSMTP:

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


ACCOUNT = {"id": 7, "email": "nina@example.com", "name": "Nina New"}
LINK = "http://localhost:5000/staff/set-password/one-time-token"


def get_row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = %s", (email,)).fetchone()


def sent_message(fake_smtp):
    assert len(fake_smtp.instances) == 1
    assert len(fake_smtp.instances[0].sent) == 1
    return fake_smtp.instances[0].sent[0]


def fail_login(monkeypatch, fake_smtp):
    def login(self, user, password):
        raise smtplib.SMTPAuthenticationError(535, b"Username and Password not accepted")

    monkeypatch.setattr(fake_smtp, "login", login)


def test_email_sent_on_registration_marks_sent(client, app, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
    sent_message(fake_smtp)
    row = get_row(app)
    assert row["email_status"] == "sent"
    assert row["email_sent_at"]


def test_connects_to_gmail_over_ssl_with_timeout(client, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
    smtp = fake_smtp.instances[0]
    assert (smtp.host, smtp.port, smtp.timeout) == ("smtp.gmail.com", 465, 15)
    assert smtp.login_args == ("organizer@gmail.com", "abcdefghijklmnop")


def test_subject_sender_and_recipient(client, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
    message = sent_message(fake_smtp)
    assert message["Subject"] == "Your ticket: Test Seminar"
    assert message["To"] == "juan@example.com"
    assert message["From"] == "Seminar Team <organizer@gmail.com>"


def test_html_shows_qr_inline_through_cid(client, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
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
    client.post("/events/test-seminar/register", data=valid_form)
    html = sent_message(fake_smtp).get_body(("html",)).get_content()
    for text in ("Hi Juan Dela Cruz", "Test Seminar", "November 30, 2026", "Main Hall",
                 "SEM-2026-0001", "Show this QR code at the check-in desk."):
        assert text in html


def test_plain_text_alternative_exists(client, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
    text = sent_message(fake_smtp).get_body(("plain",)).get_content()
    assert "Hi Juan Dela Cruz" in text
    assert "SEM-2026-0001" in text
    assert "Show this QR code at the check-in desk." in text


def test_qr_png_is_attached(client, app, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
    attachments = list(sent_message(fake_smtp).iter_attachments())
    assert len(attachments) == 1
    attachment = attachments[0]
    assert attachment.get_content_type() == "image/png"
    assert attachment.get_filename() == "SEM-2026-0001.png"
    served = client.get(f"/ticket/{get_row(app)['ticket_token']}.png").data
    assert attachment.get_content() == served


def test_inline_qr_is_the_attached_png(client, valid_form, fake_smtp):
    client.post("/events/test-seminar/register", data=valid_form)
    message = sent_message(fake_smtp)
    inline = next(part for part in message.walk() if part.get("Content-ID"))
    attachment = next(message.iter_attachments())
    assert inline.get_content() == attachment.get_content()
    assert inline.get_content().startswith(b"\x89PNG")


def test_qr_failure_sends_nothing_and_resend_recovers(client, app, valid_form, fake_smtp, monkeypatch):
    def broken_ticket_png(_attendee):
        raise RuntimeError("image library broke")

    monkeypatch.setattr(mailer, "ticket_png", broken_ticket_png)
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 302
    assert fake_smtp.instances == []
    assert get_row(app)["email_status"] == "failed"

    monkeypatch.setattr(mailer, "ticket_png", ticket_png)
    result = app.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-0001"])
    assert result.exit_code == 0, result.output
    sent_message(fake_smtp)
    assert get_row(app)["email_status"] == "sent"


def test_smtp_error_marks_failed_and_keeps_attendee(client, app, valid_form, fake_smtp, monkeypatch):
    fail_login(monkeypatch, fake_smtp)
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 302
    row = get_row(app)
    assert row is not None
    assert row["email_status"] == "failed"
    assert row["email_sent_at"] is None


def test_smtp_error_is_logged(client, valid_form, fake_smtp, monkeypatch, caplog):
    fail_login(monkeypatch, fake_smtp)
    client.post("/events/test-seminar/register", data=valid_form)
    assert "Ticket email failed for SEM-2026-0001" in caplog.text


def test_missing_credentials_marks_failed(client, app, valid_form, fake_smtp):
    app.config["SMTP_APP_PASSWORD"] = ""
    client.post("/events/test-seminar/register", data=valid_form)
    assert fake_smtp.instances == []
    assert get_row(app)["email_status"] == "failed"


def test_registered_page_says_email_was_sent(client, valid_form, fake_smtp):
    html = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True).get_data(as_text=True)
    assert "We emailed your ticket to" in html


def test_registered_page_says_email_failed(client, valid_form, fake_smtp, monkeypatch):
    fail_login(monkeypatch, fake_smtp)
    html = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True).get_data(as_text=True)
    assert "We couldn't email your ticket" in html


def test_mail_disabled_logs_instead_of_sending(client, app, valid_form, fake_smtp, caplog):
    app.config["MAIL_ENABLED"] = False
    client.post("/events/test-seminar/register", data=valid_form)
    assert fake_smtp.instances == []
    assert get_row(app)["email_status"] == "pending"
    assert "MAIL_ENABLED is off, not sending. To: juan@example.com" in caplog.text


@pytest.mark.parametrize(
    ("kind", "hours", "subject", "expiry"),
    [
        ("invite", 72, "You are invited to the Quadra staff team", "expires in 72 hours"),
        ("reset", 1, "Set a new Quadra password", "expires in 1 hour."),
    ],
)
def test_account_email_carries_the_link_in_both_parts(app, fake_smtp, kind, hours, subject, expiry):
    with app.test_request_context():
        assert mailer.send_account_email(kind, ACCOUNT, LINK, hours) is True
    message = sent_message(fake_smtp)
    assert message["Subject"] == subject
    assert message["To"] == "nina@example.com"
    assert message["From"] == "Seminar Team <organizer@gmail.com>"
    plain = message.get_body(("plain",)).get_content()
    html = message.get_body(("html",)).get_content()
    assert LINK in plain
    assert f'href="{LINK}"' in html
    assert expiry in plain
    assert expiry in html
    assert "background:#9c1b1c" in html
    assert not list(message.iter_attachments())


def test_invite_email_greets_someone_without_a_name_yet(app, fake_smtp):
    with app.test_request_context():
        mailer.send_account_email("invite", {**ACCOUNT, "name": ""}, LINK, 72)
    message = sent_message(fake_smtp)
    assert message.get_body(("plain",)).get_content().startswith("Hi,\n")
    assert "sign in with nina@example.com" in message.get_body(("plain",)).get_content()


def test_account_email_escapes_the_name(app, fake_smtp):
    with app.test_request_context():
        mailer.send_account_email("reset", {**ACCOUNT, "name": "<b>Nina</b>"}, LINK, 1)
    assert "&lt;b&gt;Nina&lt;/b&gt;" in sent_message(fake_smtp).get_body(("html",)).get_content()


@pytest.mark.parametrize("kind", ["invite", "reset"])
def test_account_email_is_logged_not_sent_when_mail_is_off(app, kind, caplog):
    with app.test_request_context(), caplog.at_level("INFO"):
        assert mailer.send_account_email(kind, ACCOUNT, LINK, 1) is False
    assert "MAIL_ENABLED is off, not sending. To: nina@example.com" in caplog.text
    assert "Subject: " in caplog.text
    assert LINK not in caplog.text
    assert "one-time-token" not in caplog.text
    assert "Nina New" not in caplog.text


def test_account_email_works_outside_a_request(app, fake_smtp):
    with app.app_context():
        assert mailer.send_account_email("reset", ACCOUNT, LINK, 1) is True
    assert LINK in sent_message(fake_smtp).get_body(("plain",)).get_content()


def test_resend_ticket_command_sends(client, app, valid_form, fake_smtp, monkeypatch):
    fail_login(monkeypatch, fake_smtp)
    client.post("/events/test-seminar/register", data=valid_form)
    monkeypatch.undo()
    monkeypatch.setattr(smtplib, "SMTP_SSL", fake_smtp)
    result = app.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-0001"])
    assert result.exit_code == 0, result.output
    assert "Ticket for SEM-2026-0001 sent to juan@example.com" in result.output
    assert get_row(app)["email_status"] == "sent"


def test_resend_ticket_command_reports_failure(client, app, valid_form, fake_smtp, monkeypatch):
    client.post("/events/test-seminar/register", data=valid_form)
    fail_login(monkeypatch, fake_smtp)
    result = app.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-0001"])
    assert result.exit_code != 0
    assert "failed" in result.output
    assert get_row(app)["email_status"] == "failed"


def test_resend_ticket_command_unknown_code(app):
    result = app.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-9999"])
    assert result.exit_code != 0
    assert "No attendee with code SEM-2026-9999" in result.output


def test_resend_ticket_command_with_mail_disabled(client, app, valid_form):
    client.post("/events/test-seminar/register", data=valid_form)
    result = app.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-0001"])
    assert result.exit_code == 0
    assert "logged instead of sent" in result.output
