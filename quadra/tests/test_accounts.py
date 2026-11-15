import hashlib
import re

import pytest

from app import accounts as account_pages
from app.db import get_db
from app.services import accounts as account_rules

BASE_URL = "http://localhost:5000"
NEW_PASSWORD = "a-brand-new-password"
WRONG_PASSWORD = "not-the-password"


@pytest.fixture
def outbox(monkeypatch):
    sent = []

    def record(kind, account, link, hours):
        sent.append({"kind": kind, "to": account["email"], "link": link, "hours": hours})
        return True

    monkeypatch.setattr(account_rules, "send_account_email", record)
    return sent


def login(client, email, password, **form):
    return client.post("/staff/login", data={"email": email, "password": password, **form})


def saved(app, email):
    with app.app_context():
        return account_rules.get_account_by_email(email)


def disable(app, account):
    with app.app_context():
        assert account_rules.disable_account(account["id"])


def link_path(app, account, purpose):
    with app.app_context():
        return account_rules.issue_link(account["id"], purpose).removeprefix(BASE_URL)


def new_password_form(**extra):
    return {"password": NEW_PASSWORD, "confirmation": NEW_PASSWORD, **extra}


def attempts(app):
    with app.app_context():
        rows = get_db().execute("SELECT email, failures FROM login_attempts ORDER BY email").fetchall()
    return {row["email"]: row["failures"] for row in rows}


def failed_login_page(app, email, password):
    response = login(app.test_client(), email, password)
    html = response.get_data(as_text=True).replace(email, "EMAIL")
    html = re.sub(r'name="csrf_token" value="[^"]*"', "", html)
    return response.status_code, sorted(response.headers.keys()), html


def test_login_page_asks_for_email_and_password(client):
    html = client.get("/staff/login").get_data(as_text=True)
    assert 'name="email"' in html
    assert 'name="password"' in html
    assert 'name="pin"' not in html
    assert 'href="/staff/forgot"' in html


def test_correct_email_and_password_open_the_scanner(client, staff):
    response = login(client, staff["email"], staff["password"])
    assert response.status_code == 302
    assert response.headers["Location"] == "/scanner"
    assert client.get("/scanner").status_code == 200


def test_email_is_matched_without_regard_to_case_or_spaces(client, staff):
    assert login(client, "  Staff@Example.COM ", staff["password"]).status_code == 302


def test_password_is_case_sensitive(client, staff):
    assert login(client, staff["email"], staff["password"].upper()).status_code == 401


def test_wrong_password_is_rejected(client, staff):
    response = login(client, staff["email"], WRONG_PASSWORD)
    assert response.status_code == 401
    assert "Wrong email or password." in response.get_data(as_text=True)
    assert client.get("/scanner").status_code == 302


def test_passwords_are_stored_hashed(app, staff):
    stored = saved(app, staff["email"])["password_hash"]
    assert stored.startswith("scrypt:")
    assert staff["password"] not in stored


def test_every_failed_login_looks_the_same(app, staff, make_account):
    disabled = make_account("gone@example.com")
    disable(app, disabled)
    invited = make_account("invited@example.com", password=None)

    wrong_password = failed_login_page(app, staff["email"], WRONG_PASSWORD)
    assert wrong_password[0] == 401
    assert failed_login_page(app, "nobody@example.com", WRONG_PASSWORD) == wrong_password
    assert failed_login_page(app, disabled["email"], disabled["password"]) == wrong_password
    assert failed_login_page(app, invited["email"], WRONG_PASSWORD) == wrong_password


@pytest.mark.parametrize("email", ["staff@example.com", "nobody@example.com"])
def test_a_password_hash_is_checked_whether_or_not_the_account_exists(client, staff, monkeypatch, email):
    checked = []

    def spy(stored, password):
        checked.append(stored)
        return False

    monkeypatch.setattr(account_rules, "check_password_hash", spy)
    login(client, email, WRONG_PASSWORD)
    assert len(checked) == 1
    assert checked[0].startswith("scrypt:")


@pytest.mark.parametrize("email", ["staff@example.com", "nobody@example.com"])
def test_five_failures_lock_that_email_for_fifteen_minutes(app, client, staff, pass_time, email):
    for _ in range(4):
        assert login(client, email, WRONG_PASSWORD).status_code == 401
    locked = login(client, email, WRONG_PASSWORD)
    assert locked.status_code == 429
    assert "Try again in 15 minutes." in locked.get_data(as_text=True)

    pass_time(minutes=14, seconds=59)
    still_locked = login(app.test_client(), email, staff["password"])
    assert still_locked.status_code == 429
    assert "Try again in 1 minute." in still_locked.get_data(as_text=True)

    pass_time(seconds=1)
    assert login(client, email, WRONG_PASSWORD).status_code == 401


def test_the_right_password_is_refused_while_locked_and_accepted_after(client, staff, pass_time):
    for _ in range(5):
        login(client, staff["email"], WRONG_PASSWORD)
    assert login(client, staff["email"], staff["password"]).status_code == 429
    assert client.get("/scanner").status_code == 302

    pass_time(minutes=15)
    assert login(client, staff["email"], staff["password"]).status_code == 302
    assert client.get("/scanner").status_code == 200


def test_attempts_while_locked_do_not_extend_the_lock(client, staff, pass_time):
    for _ in range(5):
        login(client, staff["email"], WRONG_PASSWORD)
    pass_time(minutes=10)
    assert login(client, staff["email"], WRONG_PASSWORD).status_code == 429
    pass_time(minutes=5)
    assert login(client, staff["email"], staff["password"]).status_code == 302


def test_the_lock_is_kept_in_the_database_not_in_the_app(app, staff, pass_time):
    for _ in range(5):
        login(app.test_client(), staff["email"], WRONG_PASSWORD)
    assert attempts(app) == {staff["email"]: 5}
    assert "pin_attempts" not in app.extensions
    assert login(app.test_client(), staff["email"], staff["password"]).status_code == 429


def test_the_lock_follows_the_email_not_the_device(app, staff, owner, pass_time):
    for _ in range(5):
        login(app.test_client(), staff["email"], WRONG_PASSWORD)
    assert login(app.test_client(), owner["email"], owner["password"]).status_code == 302


def test_a_successful_login_resets_the_failure_count(app, client, staff, pass_time):
    for _ in range(4):
        login(client, staff["email"], WRONG_PASSWORD)
    assert login(client, staff["email"], staff["password"]).status_code == 302
    assert attempts(app) == {}
    for _ in range(4):
        assert login(client, staff["email"], WRONG_PASSWORD).status_code == 401


def test_failures_older_than_fifteen_minutes_are_forgotten(app, client, staff, pass_time):
    for _ in range(4):
        login(client, staff["email"], WRONG_PASSWORD)
    pass_time(minutes=15)
    assert login(client, "someone-else@example.com", WRONG_PASSWORD).status_code == 401
    assert attempts(app) == {"someone-else@example.com": 1}
    for _ in range(3):
        assert login(client, staff["email"], WRONG_PASSWORD).status_code == 401


@pytest.mark.parametrize("email", ["", "not-an-email", "a" * 250 + "@example.com"])
def test_text_that_is_not_an_email_is_rejected_without_being_tracked(app, client, email):
    assert login(client, email, WRONG_PASSWORD).status_code == 401
    assert attempts(app) == {}


def test_login_starts_a_fresh_session(client, staff):
    with client.session_transaction() as before:
        before["registered_codes"] = ["SEM-2026-0001"]
        before["_csrf_token"] = "known-before-login"
    login(client, staff["email"], staff["password"])
    with client.session_transaction() as after:
        assert "registered_codes" not in after
        assert after.get("_csrf_token") != "known-before-login"
        assert after["account_id"] == staff["id"]


def test_login_records_when_the_account_last_signed_in(app, client, staff, pass_time):
    login(client, staff["email"], staff["password"])
    assert saved(app, staff["email"])["last_login_at"] == "2026-11-20T02:00:00+00:00"


def test_scanned_ticket_comes_back_after_login(client, staff):
    redirect = client.get("/checkin/some-token")
    assert redirect.headers["Location"] == "/staff/login?next=/checkin/some-token"
    assert 'value="/checkin/some-token"' in client.get(redirect.headers["Location"]).get_data(as_text=True)
    response = login(client, staff["email"], staff["password"], next="/checkin/some-token")
    assert response.headers["Location"] == "/checkin/some-token"


@pytest.mark.parametrize("target", ["https://evil.example/", "//evil.example/", "/\\evil.example"])
def test_login_never_redirects_off_site(client, staff, target):
    assert login(client, staff["email"], staff["password"], next=target).headers["Location"] == "/scanner"


def test_logout_ends_the_session(staff_client):
    assert staff_client.post("/staff/logout").status_code == 302
    assert staff_client.get("/admin").status_code == 302
    with staff_client.session_transaction() as after:
        assert "account_id" not in after


def test_a_disabled_account_loses_access_on_its_next_request(app, staff, staff_client):
    assert staff_client.get("/admin").status_code == 200
    disable(app, staff)
    assert staff_client.get("/admin").status_code == 302
    assert staff_client.post("/api/checkin", json={"code": "x"}).status_code == 401
    assert login(staff_client, staff["email"], staff["password"]).status_code == 401


def test_an_account_switched_off_in_the_database_loses_access(app, staff, staff_client):
    with app.app_context():
        get_db().execute("UPDATE accounts SET active = 0 WHERE id = %s", (staff["id"],))
        get_db().commit()
    assert staff_client.get("/admin").status_code == 302


def test_an_old_session_stays_dead_after_the_account_is_enabled_again(app, staff, staff_client):
    with staff_client.session_transaction() as kept:
        old_session = dict(kept)
    disable(app, staff)
    with app.app_context():
        account_rules.enable_account(staff["id"])
    with staff_client.session_transaction() as restored:
        restored.update(old_session)
    assert staff_client.get("/admin").status_code == 302
    assert login(staff_client, staff["email"], staff["password"]).status_code == 302


def test_a_removed_account_loses_access(app, staff, staff_client):
    with app.app_context():
        get_db().execute("DELETE FROM accounts WHERE id = %s", (staff["id"],))
        get_db().commit()
    assert staff_client.get("/admin").status_code == 302


def test_a_forged_session_version_is_refused(staff, staff_client):
    with staff_client.session_transaction() as forged:
        forged["session_version"] = staff["session_version"] + 1
    assert staff_client.get("/admin").status_code == 302


def test_visitors_without_a_session_cost_no_account_lookup(client, monkeypatch):
    def refuse(_account_id):
        raise AssertionError("public pages must not look up an account")

    monkeypatch.setattr(account_pages, "get_account", refuse)
    assert client.get("/").status_code == 200
    assert client.get("/staff/login").status_code == 200


def test_a_staff_request_looks_the_account_up_once(staff_client, monkeypatch):
    lookups = []
    real = account_pages.get_account

    def counting(account_id):
        lookups.append(account_id)
        return real(account_id)

    monkeypatch.setattr(account_pages, "get_account", counting)
    assert staff_client.get("/admin").status_code == 200
    assert len(lookups) == 1


def test_nav_shows_who_is_signed_in_and_links_to_the_account_page(staff_client):
    html = staff_client.get("/").get_data(as_text=True)
    assert '<a class="nav-name" href="/staff/account" title="Your account">Sam Staff</a>' in html
    assert "Log out" in html


def test_nav_shows_no_staff_links_to_visitors(client):
    html = client.get("/").get_data(as_text=True)
    assert "/staff/account" not in html
    assert "Log out" not in html


def test_account_page_requires_login(client):
    assert client.get("/staff/account").headers["Location"] == "/staff/login?next=/staff/account"
    assert client.post("/staff/account", data=new_password_form()).status_code == 302


def test_account_page_shows_the_signed_in_account(staff_client):
    html = staff_client.get("/staff/account").get_data(as_text=True)
    assert "<h1>Sam Staff</h1>" in html
    assert "staff@example.com" in html


def test_changing_the_password_needs_the_current_one(app, staff, staff_client):
    response = staff_client.post(
        "/staff/account", data=new_password_form(current_password=WRONG_PASSWORD)
    )
    assert response.status_code == 400
    assert "That is not your current password." in response.get_data(as_text=True)
    assert saved(app, staff["email"])["password_hash"] == staff["password_hash"]


@pytest.mark.parametrize(
    ("password", "confirmation", "message"),
    [
        ("nine-char", "nine-char", "Use at least 10 characters."),
        ("ten-chars!", "ten-chars?", "The two passwords do not match."),
        ("x" * 201, "x" * 201, "Use at most 200 characters."),
    ],
)
def test_a_new_password_must_follow_the_rules(app, staff, staff_client, password, confirmation, message):
    form = {"current_password": staff["password"], "password": password, "confirmation": confirmation}
    response = staff_client.post("/staff/account", data=form)
    assert response.status_code == 400
    assert message in response.get_data(as_text=True)
    assert saved(app, staff["email"])["password_hash"] == staff["password_hash"]


def test_a_ten_character_password_is_long_enough(staff, staff_client):
    form = {"current_password": staff["password"], "password": "ten-chars!", "confirmation": "ten-chars!"}
    assert staff_client.post("/staff/account", data=form).status_code == 302


def test_changing_the_password_replaces_the_old_one(app, staff, staff_client):
    response = staff_client.post(
        "/staff/account", data=new_password_form(current_password=staff["password"]), follow_redirects=True
    )
    assert "Your password was changed." in response.get_data(as_text=True)
    fresh = app.test_client()
    assert login(fresh, staff["email"], staff["password"]).status_code == 401
    assert login(fresh, staff["email"], NEW_PASSWORD).status_code == 302


def test_changing_the_password_signs_out_the_other_sessions(staff, sign_in):
    this_device, other_device = sign_in(staff), sign_in(staff)
    this_device.post("/staff/account", data=new_password_form(current_password=staff["password"]))
    assert this_device.get("/admin").status_code == 200
    assert other_device.get("/admin").status_code == 302


def test_invite_link_lets_the_person_set_a_name_and_password(app, client, make_account):
    invited = make_account("new@example.com", name="", password=None)
    path = link_path(app, invited, "invite")
    page = client.get(path).get_data(as_text=True)
    assert "Set up your staff account" in page
    assert 'name="name"' in page
    assert "new@example.com" in page

    response = client.post(path, data=new_password_form(name="  Nina   New "), follow_redirects=True)
    assert "Your password is saved. Sign in to continue." in response.get_data(as_text=True)
    assert saved(app, "new@example.com")["name"] == "Nina New"
    assert client.get("/scanner").status_code == 302
    assert login(client, "new@example.com", NEW_PASSWORD).status_code == 302


def test_reset_link_asks_for_a_password_only_and_keeps_the_name(app, client, staff):
    path = link_path(app, staff, "reset")
    page = client.get(path).get_data(as_text=True)
    assert "Set a new password" in page
    assert 'name="name"' not in page

    assert client.post(path, data=new_password_form(name="Changed Name")).status_code == 302
    assert saved(app, staff["email"])["name"] == "Sam Staff"
    assert login(client, staff["email"], staff["password"]).status_code == 401
    assert login(client, staff["email"], NEW_PASSWORD).status_code == 302


def test_only_a_hash_of_the_link_token_is_stored(app, staff):
    token = link_path(app, staff, "reset").rsplit("/", 1)[1]
    with app.app_context():
        stored = get_db().execute("SELECT * FROM account_tokens").fetchall()
    assert len(token) >= 43
    assert [row["token_hash"] for row in stored] == [hashlib.sha256(token.encode()).hexdigest()]
    assert token not in str(stored)


def test_links_are_built_from_the_public_base_url(app, staff):
    app.config["PUBLIC_BASE_URL"] = "https://quadra.example/"
    with app.app_context():
        link = account_rules.issue_link(staff["id"], "reset")
    assert link.startswith("https://quadra.example/staff/set-password/")


def test_a_used_link_does_not_work_again(app, client, staff):
    path = link_path(app, staff, "reset")
    assert client.post(path, data=new_password_form()).status_code == 302

    again = client.get(path)
    assert again.status_code == 410
    assert "This link no longer works" in again.get_data(as_text=True)
    assert "expired or was already used" in again.get_data(as_text=True)
    second_password = {"password": "another-password", "confirmation": "another-password"}
    assert client.post(path, data=second_password).status_code == 410
    assert login(client, staff["email"], "another-password").status_code == 401


@pytest.mark.parametrize(
    ("purpose", "lifetime"), [("invite", {"hours": 72}), ("reset", {"hours": 1})]
)
def test_links_expire(app, client, staff, pass_time, purpose, lifetime):
    path = link_path(app, staff, purpose)
    pass_time(**lifetime)
    pass_time(seconds=-1)
    assert client.get(path).status_code == 200

    pass_time(seconds=1)
    assert client.get(path).status_code == 410
    assert client.post(path, data=new_password_form(name="Sam Staff")).status_code == 410
    assert login(client, staff["email"], NEW_PASSWORD).status_code == 401


def test_a_newer_link_replaces_the_older_one(app, client, staff):
    older = link_path(app, staff, "reset")
    newer = link_path(app, staff, "reset")
    assert client.get(older).status_code == 410
    assert client.get(newer).status_code == 200


def test_an_unknown_link_does_not_work(client):
    assert client.get("/staff/set-password/made-up-token").status_code == 410
    assert client.post("/staff/set-password/made-up-token", data=new_password_form()).status_code == 410


def test_a_disabled_account_cannot_use_its_link(app, client, staff):
    path = link_path(app, staff, "reset")
    disable(app, staff)
    assert client.get(path).status_code == 410
    with app.app_context():
        account_rules.enable_account(staff["id"])
    assert client.get(path).status_code == 410


@pytest.mark.parametrize(
    ("form", "message"),
    [
        ({"name": "Nina New", "password": "short", "confirmation": "short"}, "Use at least 10 characters."),
        ({"name": "Nina New", "password": NEW_PASSWORD, "confirmation": "different"}, "The two passwords do not match."),
        ({"name": "  ", "password": NEW_PASSWORD, "confirmation": NEW_PASSWORD}, "Your name is required."),
        ({"name": "n" * 101, "password": NEW_PASSWORD, "confirmation": NEW_PASSWORD}, "Your name must be at most 100 characters."),
    ],
)
def test_a_rejected_form_leaves_the_link_usable(app, client, make_account, form, message):
    invited = make_account("new@example.com", name="", password=None)
    path = link_path(app, invited, "invite")
    response = client.post(path, data=form)
    assert response.status_code == 400
    assert message in response.get_data(as_text=True)
    assert saved(app, "new@example.com")["password_hash"] is None
    assert client.post(path, data=new_password_form(name="Nina New")).status_code == 302


def test_setting_a_password_by_link_signs_out_existing_sessions(app, staff, staff_client):
    path = link_path(app, staff, "reset")
    assert app.test_client().post(path, data=new_password_form()).status_code == 302
    assert staff_client.get("/admin").status_code == 302


def test_setting_a_password_by_link_lifts_the_lock(app, client, staff, pass_time):
    for _ in range(5):
        login(client, staff["email"], WRONG_PASSWORD)
    client.post(link_path(app, staff, "reset"), data=new_password_form())
    assert login(client, staff["email"], NEW_PASSWORD).status_code == 302


def test_forgot_password_answers_the_same_for_every_email(app, staff, make_account, outbox):
    disabled = make_account("gone@example.com")
    disable(app, disabled)
    answers = []
    for email in (staff["email"], "nobody@example.com", disabled["email"], "not-an-email", ""):
        client = app.test_client()
        response = client.post("/staff/forgot", data={"email": email})
        page = client.get(response.headers["Location"]).get_data(as_text=True)
        page = re.sub(r'name="csrf_token" value="[^"]*"', "", page)
        answers.append((response.status_code, response.headers["Location"], page))

    assert answers[0][:2] == (302, "/staff/login")
    assert "If that email has a staff account, a link to set a new password is on its way." in answers[0][2]
    assert all(answer == answers[0] for answer in answers)
    assert [(mail["kind"], mail["to"], mail["hours"]) for mail in outbox] == [("reset", staff["email"], 1)]


def test_forgotten_password_link_sets_a_new_password(app, client, staff, outbox):
    client.post("/staff/forgot", data={"email": " STAFF@example.com "})
    path = outbox[0]["link"].removeprefix(BASE_URL)
    assert path.startswith("/staff/set-password/")
    assert client.post(path, data=new_password_form()).status_code == 302
    assert login(client, staff["email"], NEW_PASSWORD).status_code == 302


def test_forgot_password_sends_one_link_every_five_minutes(client, staff, outbox, pass_time):
    client.post("/staff/forgot", data={"email": staff["email"]})
    pass_time(minutes=4, seconds=59)
    client.post("/staff/forgot", data={"email": staff["email"]})
    assert len(outbox) == 1
    assert client.get(outbox[0]["link"].removeprefix(BASE_URL)).status_code == 200

    pass_time(seconds=1)
    client.post("/staff/forgot", data={"email": staff["email"]})
    assert len(outbox) == 2


def test_forgot_password_resends_the_invite_to_someone_who_never_set_one(client, make_account, outbox):
    make_account("new@example.com", name="", password=None)
    client.post("/staff/forgot", data={"email": "new@example.com"})
    assert [(mail["kind"], mail["hours"]) for mail in outbox] == [("invite", 72)]


def test_forgot_password_survives_a_mail_failure(app, client, staff, monkeypatch):
    def broken(*_args):
        raise OSError("smtp is down")

    monkeypatch.setattr(account_rules, "send_account_email", broken)
    response = client.post("/staff/forgot", data={"email": staff["email"]})
    assert response.status_code == 302
    assert response.headers["Location"] == "/staff/login"


def test_create_owner_command_prints_a_one_time_link(app, client):
    result = app.test_cli_runner().invoke(
        args=["create-owner", "--email", "Boss@Example.com", "--name", "Bea Boss"]
    )
    assert result.exit_code == 0, result.output
    assert "Created the owner account for boss@example.com." in result.output
    link = re.search(rf"{BASE_URL}/staff/set-password/\S+", result.output).group()

    owner = saved(app, "boss@example.com")
    assert (owner["role"], owner["name"], owner["active"], owner["password_hash"]) == ("owner", "Bea Boss", 1, None)

    path = link.removeprefix(BASE_URL)
    assert 'value="Bea Boss"' in client.get(path).get_data(as_text=True)
    assert client.post(path, data=new_password_form(name="Bea Boss")).status_code == 302
    assert client.get(path).status_code == 410
    assert login(client, "boss@example.com", NEW_PASSWORD).status_code == 302


def test_create_owner_command_never_asks_for_a_password(app):
    result = app.test_cli_runner().invoke(
        args=["create-owner", "--email", "boss@example.com", "--name", "Bea Boss"], input=""
    )
    assert result.exit_code == 0
    assert "assword:" not in result.output


def test_create_owner_command_refuses_an_email_that_already_exists(app, staff):
    result = app.test_cli_runner().invoke(
        args=["create-owner", "--email", "STAFF@example.com", "--name", "Someone Else"]
    )
    assert result.exit_code != 0
    assert "already has an account" in result.output
    assert "set-password" not in result.output
    assert saved(app, staff["email"])["role"] == "admin"
    assert saved(app, staff["email"])["password_hash"] == staff["password_hash"]


def test_create_owner_command_rejects_a_bad_email(app):
    result = app.test_cli_runner().invoke(args=["create-owner", "--email", "boss", "--name", "Bea Boss"])
    assert result.exit_code != 0
    assert "Enter a valid email address" in result.output
