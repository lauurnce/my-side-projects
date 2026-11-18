from email.message import EmailMessage

import pytest

from app import staging
from app.db import get_db
from app.services import accounts as account_rules
from app.services import delivery, mailer

TESTER = "tester@example.com"
OUTSIDER = "real.person@example.org"
ALLOWLIST = f"{TESTER}, Second.Tester@Example.com\nthird+only@example.com"
DECIDE = "/admin/events/test-seminar/decide"
SEND = "/admin/events/test-seminar/emails"
SETTINGS = {
    "PUBLIC_BASE_URL": "http://localhost:5000",
    "CSRF_ENABLED": False,
    "MAIL_ENABLED": False,
    "TODAY": "2026-11-01",
    "EVENT_NAME": "Test Seminar",
    "EVENT_DATE": "November 30, 2026",
    "EVENT_VENUE": "Main Hall",
}


@pytest.fixture
def app(make_app):
    return make_app({
        **SETTINGS,
        "STAGING": True,
        "SECRET_KEY": "a-long-random-staging-key",
        "STAGING_MAIL_ALLOWLIST": ALLOWLIST,
    })


@pytest.fixture
def automatic(app):
    with app.app_context():
        get_db().execute("UPDATE events SET review_applications = 0")
        get_db().commit()
    return app


def form(email, name="Juan Dela Cruz"):
    return {
        "full_name": name,
        "email": email,
        "organization": "PUP",
        "contact_number": "09171234567",
        "consent": "yes",
    }


def apply(client, email):
    return client.post("/events/test-seminar/register", data=form(email), follow_redirects=True)


def rows(app):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()


def statuses(app):
    return [row["email_status"] for row in rows(app)]


def sent(fake_smtp):
    return [message for smtp in fake_smtp.instances for message in smtp.sent]


def recipients(fake_smtp):
    return [message["To"] for message in sent(fake_smtp)]


def decide(client, action, *ids):
    return client.post(DECIDE, data={"action": action, "ids": [str(value) for value in ids]}, follow_redirects=True)


def link_count(app):
    with app.app_context():
        return get_db().execute("SELECT COUNT(*) AS total FROM account_tokens").fetchone()["total"]


def message_to(*addresses, header="To"):
    message = EmailMessage()
    message["Subject"] = "Hello"
    message[header] = ", ".join(addresses)
    return message


@pytest.mark.parametrize(
    "address",
    [
        TESTER,
        "TESTER@EXAMPLE.COM",
        "  tester@example.com ",
        "tester+accepted@example.com",
        "tester+a+b@example.com",
        "second.tester@example.com",
        "third+only@example.com",
    ],
)
def test_allowlisted_addresses_may_be_emailed(app, address):
    with app.app_context():
        assert staging.may_email(address)


@pytest.mark.parametrize(
    "address",
    [
        OUTSIDER,
        "tester@example.org",
        "tester@example.com.evil.test",
        "xtester@example.com",
        "tester@example.comx",
        "third@example.com",
        "third+other@example.com",
        "third+only+more@example.com",
        "",
        "@",
        "tester",
        "example.com",
    ],
)
def test_other_addresses_may_not_be_emailed(app, address):
    with app.app_context():
        assert not staging.may_email(address)


@pytest.mark.parametrize("allowlist", ["", "   ", ",;\n"])
def test_an_empty_allowlist_emails_nobody(app, allowlist):
    app.config["STAGING_MAIL_ALLOWLIST"] = allowlist
    with app.app_context():
        assert not staging.may_email(TESTER)
        assert not staging.may_email("")
        assert not staging.may_email("@")


def test_ticket_for_an_outsider_is_held_back_without_connecting(automatic, client, fake_smtp, caplog):
    with caplog.at_level("INFO"):
        page = apply(client, OUTSIDER).get_data(as_text=True)
    assert fake_smtp.instances == []
    assert statuses(automatic) == ["held"]
    assert rows(automatic)[0]["email_sent_at"] is None
    assert f"Staging held back an email. To: {OUTSIDER} | Subject: [Test copy] Your ticket: Test Seminar" in caplog.text
    assert "no ticket was emailed to" in page
    assert "We emailed your ticket" not in page


def test_held_back_log_never_carries_the_body(automatic, client, fake_smtp, caplog):
    with caplog.at_level("DEBUG"):
        apply(client, OUTSIDER)
    row = rows(automatic)[0]
    assert row["status_token"] not in caplog.text
    assert row["ticket_token"] not in caplog.text
    assert "Juan Dela Cruz" not in caplog.text


def test_ticket_for_an_allowlisted_tester_is_sent_and_marked_as_a_test(automatic, client, fake_smtp):
    apply(client, "tester+ticket@example.com")
    assert recipients(fake_smtp) == ["tester+ticket@example.com"]
    assert sent(fake_smtp)[0]["Subject"] == "[Test copy] Your ticket: Test Seminar"
    assert statuses(automatic) == ["sent"]


def test_accepting_a_mixed_group_sends_to_testers_and_holds_back_the_rest(app, client, staff_client, fake_smtp):
    for email in (TESTER, OUTSIDER, "another.person@example.org"):
        apply(client, email)
    page = decide(staff_client, "accept", 1, 2, 3).get_data(as_text=True)
    assert recipients(fake_smtp) == [TESTER]
    assert statuses(app) == ["sent", "held", "held"]
    assert "1 email sent." in page
    assert "2 held back, not sent. This test copy only emails addresses on its allowlist." in page
    assert page.count("ticket held back") == 2
    assert page.count("pill-held") == 2


def test_decline_email_for_an_outsider_is_held_back(app, client, staff_client, fake_smtp, caplog):
    apply(client, OUTSIDER)
    with caplog.at_level("INFO"):
        page = decide(staff_client, "decline", 1).get_data(as_text=True)
    assert fake_smtp.instances == []
    assert statuses(app) == ["held"]
    assert "decline held back" in page
    assert f"To: {OUTSIDER} | Subject: [Test copy] Your application: Test Seminar" in caplog.text


def test_decline_email_for_a_tester_is_sent(app, client, staff_client, fake_smtp):
    apply(client, TESTER)
    decide(staff_client, "decline", 1)
    assert recipients(fake_smtp) == [TESTER]
    assert sent(fake_smtp)[0]["Subject"] == "[Test copy] Your application: Test Seminar"


def test_accept_all_pending_holds_back_every_outsider(app, client, staff_client, fake_smtp):
    for number in range(4):
        apply(client, f"person{number}@example.org")
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    assert fake_smtp.instances == []
    assert statuses(app) == ["held"] * 4


def test_held_back_emails_do_not_wait_in_the_queue(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    decide(staff_client, "accept", 1)
    dashboard = staff_client.get("/admin").get_data(as_text=True)
    assert 'id="email-queue"' not in dashboard
    for which in ("waiting", "failed"):
        page = staff_client.post(SEND, data={"which": which}, follow_redirects=True).get_data(as_text=True)
        assert "There was nothing to send." in page
    assert fake_smtp.instances == []
    assert statuses(app) == ["held"]


def test_held_back_does_not_count_as_sent(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    dashboard = decide(staff_client, "accept", 1).get_data(as_text=True)
    assert '<dd id="total-emails-sent">0</dd>' in dashboard


def test_resending_to_an_outsider_holds_it_back_again(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    decide(staff_client, "accept", 1)
    page = staff_client.post("/admin/resend/1", follow_redirects=True).get_data(as_text=True)
    assert "The ticket for SEM-2026-0001 was held back, not sent." in page
    assert fake_smtp.instances == []
    assert statuses(app) == ["held"]


def test_resending_after_joining_the_allowlist_sends(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    decide(staff_client, "accept", 1)
    app.config["STAGING_MAIL_ALLOWLIST"] = OUTSIDER
    staff_client.post("/admin/resend/1")
    assert recipients(fake_smtp) == [OUTSIDER]
    assert statuses(app) == ["sent"]


def test_changing_a_held_back_decision_holds_back_the_new_email(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    decide(staff_client, "accept", 1)
    page = decide(staff_client, "decline", 1).get_data(as_text=True)
    assert "decline held back" in page
    assert fake_smtp.instances == []


def test_resend_ticket_command_reports_the_hold(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    decide(staff_client, "accept", 1)
    result = app.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-0001"])
    assert result.exit_code != 0
    assert "is not on STAGING_MAIL_ALLOWLIST, so the ticket was held back" in result.output
    assert fake_smtp.instances == []


def test_csv_export_says_held(app, client, staff_client, fake_smtp):
    apply(client, OUTSIDER)
    decide(staff_client, "accept", 1)
    assert ",held," in staff_client.get("/admin/export.csv").get_data(as_text=True)


def test_invite_for_an_outsider_is_held_back_and_issues_no_link(app, owner_client, fake_smtp, caplog):
    with caplog.at_level("INFO"):
        page = owner_client.post("/staff/team/invite", data={"email": OUTSIDER}, follow_redirects=True)
    assert f"the invite for {OUTSIDER} was held back" in page.get_data(as_text=True)
    assert fake_smtp.instances == []
    assert link_count(app) == 0
    assert f"To: {OUTSIDER} | Subject: You are invited to the Quadra staff team" in caplog.text
    assert "set-password" not in caplog.text


def test_resent_invite_for_an_outsider_is_held_back(app, owner_client, make_account, fake_smtp):
    invited = make_account(OUTSIDER, name="", password=None)
    page = owner_client.post(f"/staff/team/{invited['id']}/resend", follow_redirects=True)
    assert "was held back" in page.get_data(as_text=True)
    assert fake_smtp.instances == []
    assert link_count(app) == 0


def test_invite_for_a_tester_is_sent_and_marked_as_a_test(app, owner_client, fake_smtp, caplog):
    with caplog.at_level("INFO"):
        owner_client.post("/staff/team/invite", data={"email": TESTER})
    assert recipients(fake_smtp) == [TESTER]
    assert sent(fake_smtp)[0]["Subject"] == "[Test copy] You are invited to the Quadra staff team"
    assert link_count(app) == 1
    assert "set-password" not in caplog.text


def test_password_reset_for_an_outsider_is_held_back(app, client, make_account, fake_smtp, caplog):
    make_account(OUTSIDER)
    with caplog.at_level("INFO"):
        page = client.post("/staff/forgot", data={"email": OUTSIDER}, follow_redirects=True)
    assert "If that email has a staff account" in page.get_data(as_text=True)
    assert fake_smtp.instances == []
    assert link_count(app) == 0
    assert f"To: {OUTSIDER} | Subject: Set a new Quadra password" in caplog.text
    assert "set-password" not in caplog.text


def test_password_reset_for_a_tester_is_sent(app, client, make_account, fake_smtp):
    make_account(TESTER)
    client.post("/staff/forgot", data={"email": TESTER})
    assert recipients(fake_smtp) == [TESTER]
    assert sent(fake_smtp)[0]["Subject"] == "[Test copy] Set a new Quadra password"


@pytest.mark.parametrize("kind", ["invite", "reset"])
def test_account_email_sent_around_the_check_is_still_refused(app, fake_smtp, kind):
    account = {"id": 7, "email": OUTSIDER, "name": "Nina New"}
    with app.app_context(), pytest.raises(staging.HeldBackError):
        mailer.send_account_email(kind, account, "http://localhost:5000/staff/set-password/token", 72)
    assert sent(fake_smtp) == []


def test_refused_account_email_is_reported_as_failed_not_sent(app, fake_smtp, make_account, monkeypatch):
    account = make_account(OUTSIDER, password=None)
    monkeypatch.setattr(account_rules, "may_email", lambda _address: True)
    with app.app_context():
        assert account_rules.email_link(account) == "failed"
    assert sent(fake_smtp) == []


def test_decision_email_sent_around_the_check_is_marked_failed(app, client, staff_client, fake_smtp, monkeypatch):
    apply(client, OUTSIDER)
    monkeypatch.setattr(delivery, "may_email", lambda _address: True)
    decide(staff_client, "accept", 1)
    assert sent(fake_smtp) == []
    assert statuses(app) == ["failed"]


@pytest.mark.parametrize(
    "message",
    [
        message_to(OUTSIDER),
        message_to(TESTER, OUTSIDER),
        message_to(f"Tester <{TESTER}>", f"Someone Real <{OUTSIDER}>"),
        message_to(OUTSIDER, header="Cc"),
        message_to(OUTSIDER, header="Bcc"),
        message_to(),
    ],
)
def test_the_connection_itself_refuses_anyone_off_the_allowlist(app, fake_smtp, message):
    with app.app_context(), mailer.mail_connection() as smtp, pytest.raises(staging.HeldBackError):
        smtp.send_message(message)
    assert sent(fake_smtp) == []


def test_the_connection_refuses_a_tester_with_an_outsider_copied_in(app, fake_smtp):
    message = message_to(TESTER)
    message["Bcc"] = OUTSIDER
    with app.app_context(), mailer.mail_connection() as smtp, pytest.raises(staging.HeldBackError):
        smtp.send_message(message)
    assert sent(fake_smtp) == []


def test_the_connection_sends_to_testers(app, fake_smtp):
    with app.app_context(), mailer.mail_connection() as smtp:
        smtp.send_message(message_to(f"Tester <{TESTER}>", "second.tester@example.com"))
    assert len(sent(fake_smtp)) == 1


def test_the_connection_offers_no_other_way_to_send(app, fake_smtp):
    with app.app_context(), mailer.mail_connection() as smtp:
        assert not hasattr(smtp, "sendmail")
        with pytest.raises(TypeError):
            smtp.send_message(message_to(TESTER), to_addrs=[OUTSIDER])
    assert sent(fake_smtp) == []


def test_staging_with_mail_off_sends_nothing_at_all(automatic, client, caplog):
    with caplog.at_level("INFO"):
        apply(client, TESTER)
    assert statuses(automatic) == ["pending"]
    assert f"MAIL_ENABLED is off, not sending. To: {TESTER}" in caplog.text


class TestOutsideStaging:

    @pytest.fixture
    def app(self, make_app):
        app = make_app({**SETTINGS, "STAGING_MAIL_ALLOWLIST": TESTER})
        with app.app_context():
            get_db().execute("UPDATE events SET review_applications = 0")
            get_db().commit()
        return app

    def test_the_allowlist_is_ignored(self, app):
        with app.app_context():
            assert staging.may_email(OUTSIDER)

    def test_tickets_go_to_anyone_with_the_usual_subject(self, app, client, fake_smtp):
        apply(client, OUTSIDER)
        assert recipients(fake_smtp) == [OUTSIDER]
        assert sent(fake_smtp)[0]["Subject"] == "Your ticket: Test Seminar"
        assert statuses(app) == ["sent"]

    def test_invites_go_to_anyone_with_the_usual_subject(self, app, owner_client, fake_smtp):
        owner_client.post("/staff/team/invite", data={"email": OUTSIDER})
        assert recipients(fake_smtp) == [OUTSIDER]
        assert sent(fake_smtp)[0]["Subject"] == "You are invited to the Quadra staff team"

    def test_the_connection_is_the_plain_smtp_connection(self, app, fake_smtp):
        with app.app_context(), mailer.mail_connection() as smtp:
            assert smtp is fake_smtp.instances[0]

    def test_production_sends_to_anyone_through_the_plain_connection(self, make_app, fake_smtp, monkeypatch):
        app = make_app({**SETTINGS, "PRODUCTION": True, "SECRET_KEY": "a-long-random-production-key"})
        app.config.update(MAIL_ENABLED=True, SMTP_USER="organizer@gmail.com", SMTP_APP_PASSWORD="abcd")
        with app.app_context():
            assert staging.may_email(OUTSIDER)
            assert staging.marked_subject("Your ticket") == "Your ticket"
            with mailer.mail_connection() as smtp:
                assert smtp is fake_smtp.instances[0]
