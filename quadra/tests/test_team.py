import pytest

from app.db import get_db
from app.services import accounts as account_rules

BASE_URL = "http://localhost:5000"
NEW_PASSWORD = "a-brand-new-password"
OWNER_ACTIONS = ["/staff/team/invite", "/staff/team/1/resend", "/staff/team/1/disable", "/staff/team/1/enable"]


@pytest.fixture
def outbox(monkeypatch):
    sent = []

    def record(kind, account, link, hours):
        sent.append({"kind": kind, "to": account["email"], "link": link, "hours": hours})
        return True

    monkeypatch.setattr(account_rules, "send_account_email", record)
    return sent


def saved(app, email):
    with app.app_context():
        return account_rules.get_account_by_email(email)


def account_count(app):
    with app.app_context():
        return get_db().execute("SELECT COUNT(*) AS total FROM accounts").fetchone()["total"]


def test_team_page_sends_visitors_to_login(client):
    assert client.get("/staff/team").headers["Location"] == "/staff/login?next=/staff/team"


@pytest.mark.parametrize("path", OWNER_ACTIONS)
def test_team_actions_send_visitors_to_login(app, client, owner, path):
    response = client.post(path, data={"email": "new@example.com"})
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/staff/login")
    assert account_count(app) == 1
    assert saved(app, owner["email"])["active"] == 1


def test_admins_cannot_open_the_team_page(staff_client):
    response = staff_client.get("/staff/team")
    assert response.status_code == 403
    assert "This is closed to you" in response.get_data(as_text=True)


@pytest.mark.parametrize("path", OWNER_ACTIONS)
def test_admins_cannot_use_the_owner_tools(app, owner, staff_client, outbox, path):
    assert staff_client.post(path, data={"email": "new@example.com"}).status_code == 403
    assert account_count(app) == 2
    assert saved(app, owner["email"])["active"] == 1
    assert outbox == []


def test_only_owners_see_the_team_link(owner, staff, sign_in):
    assert 'href="/staff/team"' in sign_in(owner).get("/staff/account").get_data(as_text=True)
    assert 'href="/staff/team"' not in sign_in(staff).get("/staff/account").get_data(as_text=True)
    assert 'href="/staff/team"' not in sign_in(staff).get("/admin").get_data(as_text=True)


def test_team_page_lists_every_account(app, owner_client, staff, make_account):
    make_account("new@example.com", name="", password=None)
    gone = make_account("gone@example.com", "Gina Gone")
    with app.app_context():
        account_rules.disable_account(gone["id"])

    html = owner_client.get("/staff/team").get_data(as_text=True)
    for text in ("Olivia Owner", "owner@example.com", "Sam Staff", "staff@example.com", "new@example.com", "Gina Gone"):
        assert text in html
    assert html.count(">Active</span>") == 2
    assert html.count(">Invited</span>") == 1
    assert html.count(">Disabled</span>") == 1
    assert "scrypt:" not in html


def test_owner_invites_an_admin_by_email(app, owner_client, outbox):
    response = owner_client.post("/staff/team/invite", data={"email": " New@Example.com "}, follow_redirects=True)
    assert "An invite was sent to new@example.com." in response.get_data(as_text=True)

    invited = saved(app, "new@example.com")
    assert (invited["role"], invited["active"], invited["password_hash"]) == ("admin", 1, None)
    assert [(mail["kind"], mail["to"], mail["hours"]) for mail in outbox] == [("invite", "new@example.com", 72)]
    assert outbox[0]["link"].startswith(f"{BASE_URL}/staff/set-password/")


def test_invited_admin_sets_up_the_account_and_signs_in(app, client, owner_client, outbox):
    owner_client.post("/staff/team/invite", data={"email": "new@example.com"})
    path = outbox[0]["link"].removeprefix(BASE_URL)
    fresh = app.test_client()
    form = {"name": "Nina New", "password": NEW_PASSWORD, "confirmation": NEW_PASSWORD}
    assert fresh.post(path, data=form).status_code == 302
    assert fresh.post("/staff/login", data={"email": "new@example.com", "password": NEW_PASSWORD}).status_code == 302
    assert fresh.get("/admin").status_code == 200
    assert fresh.get("/staff/team").status_code == 403


def test_an_invited_account_cannot_sign_in_before_setting_a_password(client, owner_client, outbox):
    owner_client.post("/staff/team/invite", data={"email": "new@example.com"})
    for password in ("", "None", "new@example.com"):
        response = client.post("/staff/login", data={"email": "new@example.com", "password": password})
        assert response.status_code == 401


@pytest.mark.parametrize(
    ("email", "message"),
    [
        ("STAFF@example.com", "That email already has an account."),
        ("owner@example.com", "That email already has an account."),
        ("not-an-email", "Enter a valid email address"),
        ("", "Email address is required."),
    ],
)
def test_invite_reports_what_is_wrong(app, owner_client, staff, outbox, email, message):
    response = owner_client.post("/staff/team/invite", data={"email": email})
    assert response.status_code == 400
    assert message in response.get_data(as_text=True)
    assert account_count(app) == 2
    assert outbox == []


def test_invite_with_mail_off_says_it_was_logged(app, owner_client, caplog):
    with caplog.at_level("INFO"):
        response = owner_client.post("/staff/team/invite", data={"email": "new@example.com"}, follow_redirects=True)
    assert "MAIL_ENABLED is off, so the invite for new@example.com was logged instead of sent." in response.get_data(as_text=True)
    assert f"Set-password link for new@example.com: {BASE_URL}/staff/set-password/" in caplog.text
    assert caplog.text.count("/staff/set-password/") == 1
    assert "You have been given a Quadra staff account" not in caplog.text


def link_count(app):
    with app.app_context():
        return get_db().execute("SELECT COUNT(*) AS total FROM account_tokens").fetchone()["total"]


def test_invite_in_production_with_mail_off_issues_no_link(app, owner_client, caplog):
    app.config["PRODUCTION"] = True
    with caplog.at_level("INFO"):
        response = owner_client.post("/staff/team/invite", data={"email": "new@example.com"}, follow_redirects=True)
    assert "Email is turned off, so the invite could not be sent" in response.get_data(as_text=True)
    assert link_count(app) == 0
    assert "set-password" not in caplog.text
    assert saved(app, "new@example.com")["password_hash"] is None


def test_resend_in_production_with_mail_off_issues_no_link(app, owner_client, make_account, caplog):
    invited = make_account("new@example.com", name="", password=None)
    app.config["PRODUCTION"] = True
    with caplog.at_level("INFO"):
        response = owner_client.post(f"/staff/team/{invited['id']}/resend", follow_redirects=True)
    assert "Email is turned off, so the invite could not be sent" in response.get_data(as_text=True)
    assert link_count(app) == 0
    assert "set-password" not in caplog.text


def test_invite_in_production_with_mail_on_sends_without_logging_the_link(app, owner_client, outbox, caplog):
    app.config.update(PRODUCTION=True, MAIL_ENABLED=True)
    with caplog.at_level("INFO"):
        owner_client.post("/staff/team/invite", data={"email": "new@example.com"})
    assert len(outbox) == 1
    assert link_count(app) == 1
    assert "set-password" not in caplog.text


def test_invite_that_fails_to_send_keeps_the_account_for_a_resend(app, owner_client, monkeypatch):
    def broken(*_args):
        raise OSError("smtp is down")

    monkeypatch.setattr(account_rules, "send_account_email", broken)
    response = owner_client.post("/staff/team/invite", data={"email": "new@example.com"}, follow_redirects=True)
    assert "could not be sent" in response.get_data(as_text=True)
    assert saved(app, "new@example.com") is not None


def test_resending_an_invite_replaces_the_old_link(app, client, owner_client, outbox):
    owner_client.post("/staff/team/invite", data={"email": "new@example.com"})
    invited = saved(app, "new@example.com")
    response = owner_client.post(f"/staff/team/{invited['id']}/resend", follow_redirects=True)
    assert "An invite was sent to new@example.com." in response.get_data(as_text=True)

    first, second = (mail["link"].removeprefix(BASE_URL) for mail in outbox)
    assert client.get(first).status_code == 410
    assert client.get(second).status_code == 200


def test_an_accepted_invite_cannot_be_resent(owner_client, staff, outbox):
    assert owner_client.post(f"/staff/team/{staff['id']}/resend").status_code == 400
    assert outbox == []


def test_owner_disables_and_enables_an_admin(app, owner_client, staff, sign_in):
    staff_device = sign_in(staff)
    response = owner_client.post(f"/staff/team/{staff['id']}/disable", follow_redirects=True)
    assert "staff@example.com was disabled and signed out." in response.get_data(as_text=True)
    assert staff_device.get("/admin").status_code == 302
    credentials = {"email": staff["email"], "password": staff["password"]}
    assert staff_device.post("/staff/login", data=credentials).status_code == 401

    response = owner_client.post(f"/staff/team/{staff['id']}/enable", follow_redirects=True)
    assert "staff@example.com can sign in again." in response.get_data(as_text=True)
    assert staff_device.post("/staff/login", data=credentials).status_code == 302


def test_disabling_an_invited_admin_kills_the_invite_link(app, client, owner_client, outbox):
    owner_client.post("/staff/team/invite", data={"email": "new@example.com"})
    owner_client.post(f"/staff/team/{saved(app, 'new@example.com')['id']}/disable")
    assert client.get(outbox[0]["link"].removeprefix(BASE_URL)).status_code == 410


def test_an_owner_cannot_disable_themselves(app, owner, owner_client):
    response = owner_client.post(f"/staff/team/{owner['id']}/disable")
    assert response.status_code == 403
    assert "You cannot disable your own account." in response.get_data(as_text=True)
    assert saved(app, owner["email"])["active"] == 1
    assert owner_client.get("/staff/team").status_code == 200


def test_the_team_page_offers_no_button_to_disable_yourself(owner, owner_client, staff):
    html = owner_client.get("/staff/team").get_data(as_text=True)
    assert f'action="/staff/team/{staff["id"]}/disable"' in html
    assert f'action="/staff/team/{owner["id"]}/disable"' not in html


def test_the_last_active_owner_can_never_be_disabled(app, owner, make_account):
    second = make_account("second@example.com", "Second Owner", "owner")
    with app.app_context():
        assert account_rules.disable_account(second["id"]) is True
        assert account_rules.disable_account(owner["id"]) is False
    assert saved(app, owner["email"])["active"] == 1


def test_one_owner_can_disable_another_but_not_the_last(app, owner, owner_client, make_account, sign_in):
    second = make_account("second@example.com", "Second Owner", "owner")
    second_client = sign_in(second)
    assert owner_client.post(f"/staff/team/{second['id']}/disable").status_code == 302
    assert saved(app, second["email"])["active"] == 0
    assert second_client.post(f"/staff/team/{owner['id']}/disable").status_code == 302
    assert second_client.get("/staff/team").status_code == 302
    assert saved(app, owner["email"])["active"] == 1


@pytest.mark.parametrize("action", ["resend", "disable", "enable"])
def test_team_actions_on_an_unknown_account_are_a_404(owner_client, action):
    assert owner_client.post(f"/staff/team/999/{action}").status_code == 404


def test_an_owner_made_by_the_command_can_open_the_team_page(app, client):
    result = app.test_cli_runner().invoke(args=["create-owner", "--email", "boss@example.com", "--name", "Bea Boss"])
    path = result.output.split(BASE_URL)[1].strip()
    client.post(path, data={"name": "Bea Boss", "password": NEW_PASSWORD, "confirmation": NEW_PASSWORD})
    client.post("/staff/login", data={"email": "boss@example.com", "password": NEW_PASSWORD})
    assert client.get("/staff/team").status_code == 200


def test_a_demoted_owner_loses_the_team_page_on_the_next_request(app, owner, owner_client):
    with app.app_context():
        get_db().execute("UPDATE accounts SET role = 'admin' WHERE id = %s", (owner["id"],))
        get_db().commit()
    assert owner_client.get("/staff/team").status_code == 403
