import csv
import io

import pytest

from app import commands, staff
from app.db import get_db
from app.services import registration
from app.services.checkin import extract_token, totals

PIN = "4321"
FIRST_CHECKIN_UTC = "2026-11-30T08:15:00+00:00"
FIRST_CHECKIN_SHOWN = "Nov 30, 2026 4:15 PM"
OTHER_FORM = {
    "full_name": "Maria Santos",
    "email": "maria@example.com",
    "organization": "TUP",
    "contact_number": "09181234567",
}


@pytest.fixture
def staff_app(app):
    app.config["STAFF_PIN"] = PIN
    return app


@pytest.fixture
def clock(monkeypatch):
    now = {"seconds": 1000.0}
    monkeypatch.setattr(staff, "monotonic", lambda: now["seconds"])
    return now


def login(client, pin=PIN, **form):
    return client.post("/staff/login", data={"pin": pin, **form})


@pytest.fixture
def staff_client(staff_app, client):
    assert login(client).status_code == 302
    return client


def register(client, form):
    assert client.post("/events/test-seminar/register", data=form).status_code == 302


def row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = %s", (email,)).fetchone()


@pytest.fixture
def token(staff_app, client, valid_form):
    register(client, valid_form)
    return row(staff_app)["ticket_token"]


def set_first_checkin_time(app, value):
    with app.app_context():
        get_db().execute("UPDATE attendees SET checked_in_at = %s WHERE checked_in = 1", (value,))
        get_db().commit()


def set_created_time(app, value):
    with app.app_context():
        get_db().execute("UPDATE attendees SET created_at = %s", (value,))
        get_db().commit()


def test_login_page_asks_for_the_pin(client):
    html = client.get("/staff/login").get_data(as_text=True)
    assert 'name="pin"' in html


def test_correct_pin_opens_the_scanner(staff_app, client):
    response = login(client)
    assert response.status_code == 302
    assert response.headers["Location"] == "/scanner"
    assert client.get("/scanner").status_code == 200


def test_wrong_pin_is_rejected(staff_app, client):
    response = login(client, pin="0000")
    assert response.status_code == 401
    assert "Wrong PIN." in response.get_data(as_text=True)
    assert client.get("/scanner").status_code == 302


def test_login_is_off_when_no_pin_is_configured(app, client):
    response = login(client, pin="")
    assert response.status_code == 503
    assert client.get("/scanner").status_code == 302


def test_logout_ends_the_staff_session(staff_client):
    assert staff_client.post("/staff/logout").status_code == 302
    assert staff_client.get("/admin").status_code == 302


@pytest.mark.parametrize("path", ["/scanner", "/admin", "/admin/export.csv", "/checkin/some-token"])
def test_staff_pages_send_visitors_to_login(staff_app, client, path):
    response = client.get(path)
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/staff/login?next=")


def test_api_checkin_requires_login(staff_app, client, token):
    response = client.post("/api/checkin", json={"code": token})
    assert response.status_code == 401
    assert response.get_json() == {"status": "login_required"}
    assert row(staff_app)["checked_in"] == 0


def test_admin_actions_require_login(staff_app, client, token):
    attendee_id = row(staff_app)["id"]
    assert client.post(f"/admin/checkin/{attendee_id}").status_code == 302
    assert row(staff_app)["checked_in"] == 0


def test_scanned_ticket_comes_back_after_login(staff_app, client, token):
    redirect = client.get(f"/checkin/{token}")
    login_url = redirect.headers["Location"]
    assert row(staff_app)["checked_in"] == 0

    form_html = client.get(login_url).get_data(as_text=True)
    assert f'value="/checkin/{token}"' in form_html

    response = login(client, next=f"/checkin/{token}")
    assert response.headers["Location"] == f"/checkin/{token}"
    assert "CHECKED IN: Juan Dela Cruz (SEM-2026-0001)" in client.get(
        response.headers["Location"]
    ).get_data(as_text=True)


@pytest.mark.parametrize("target", ["https://evil.example/", "//evil.example/", "/\\evil.example"])
def test_login_never_redirects_off_site(staff_app, client, target):
    assert login(client, next=target).headers["Location"] == "/scanner"


def test_checkin_marks_the_attendee(staff_app, staff_client, token):
    response = staff_client.get(f"/checkin/{token}")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "CHECKED IN: Juan Dela Cruz (SEM-2026-0001)" in html
    assert "status-checked_in" in html

    saved = row(staff_app)
    assert saved["checked_in"] == 1
    assert saved["checked_in_at"]


def test_second_scan_says_already_and_keeps_the_first_time(staff_app, staff_client, token):
    staff_client.get(f"/checkin/{token}")
    set_first_checkin_time(staff_app, FIRST_CHECKIN_UTC)

    response = staff_client.get(f"/checkin/{token}")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert f"ALREADY CHECKED IN at {FIRST_CHECKIN_SHOWN}" in html
    assert "status-already" in html
    assert row(staff_app)["checked_in_at"] == FIRST_CHECKIN_UTC


def test_unknown_token_is_an_invalid_ticket(staff_client):
    response = staff_client.get("/checkin/not-a-real-token")
    html = response.get_data(as_text=True)
    assert response.status_code == 404
    assert "INVALID TICKET" in html
    assert "status-invalid" in html


def test_api_checkin_accepts_the_full_url(staff_app, staff_client, token):
    response = staff_client.post(
        "/api/checkin", json={"code": f"http://localhost:5000/checkin/{token}"}
    )
    body = response.get_json()
    assert body["status"] == "checked_in"
    assert body["name"] == "Juan Dela Cruz"
    assert body["code"] == "SEM-2026-0001"
    assert row(staff_app)["checked_in"] == 1


def test_api_checkin_accepts_the_bare_token(staff_app, staff_client, token):
    response = staff_client.post("/api/checkin", json={"code": f"  {token}\n"})
    assert response.get_json()["status"] == "checked_in"
    assert row(staff_app)["checked_in"] == 1


def test_api_checkin_second_scan_returns_already(staff_app, staff_client, token):
    staff_client.post("/api/checkin", json={"code": token})
    set_first_checkin_time(staff_app, FIRST_CHECKIN_UTC)

    body = staff_client.post("/api/checkin", json={"code": token}).get_json()
    assert body["status"] == "already"
    assert body["checked_in_at"] == FIRST_CHECKIN_SHOWN
    assert row(staff_app)["checked_in_at"] == FIRST_CHECKIN_UTC


@pytest.mark.parametrize("payload", [{"code": "nope"}, {"code": ""}, {}])
def test_api_checkin_reports_an_invalid_code(staff_client, payload):
    response = staff_client.post("/api/checkin", json=payload)
    assert response.status_code == 200
    assert response.get_json() == {"status": "invalid"}


def test_api_checkin_accepts_the_csrf_header(staff_app, staff_client, token):
    staff_app.config["CSRF_ENABLED"] = True
    assert staff_client.post("/api/checkin", json={"code": token}).status_code == 400

    with staff_client.session_transaction() as browser_session:
        browser_session["_csrf_token"] = "known-token"
    response = staff_client.post(
        "/api/checkin", json={"code": token}, headers={"X-CSRF-Token": "known-token"}
    )
    assert response.get_json()["status"] == "checked_in"


@pytest.mark.parametrize(
    "scanned, expected",
    [
        ("abc123", "abc123"),
        ("  abc123  ", "abc123"),
        ("http://192.168.1.5:5000/checkin/abc123", "abc123"),
        ("https://example.trycloudflare.com/checkin/abc123/", "abc123"),
        ("http://localhost:5000/checkin/abc123?from=mail#top", "abc123"),
        ("", ""),
        (None, ""),
    ],
)
def test_extract_token(scanned, expected):
    assert extract_token(scanned) == expected


def test_five_wrong_pins_lock_login_for_sixty_seconds(staff_app, client, clock):
    for _ in range(4):
        assert login(client, pin="0000").status_code == 401
    locked = login(client, pin="0000")
    assert locked.status_code == 429
    assert "Try again in 60 seconds" in locked.get_data(as_text=True)

    clock["seconds"] += 59
    still_locked = login(client)
    assert still_locked.status_code == 429
    assert "Try again in 1 seconds" in still_locked.get_data(as_text=True)
    assert client.get("/scanner").status_code == 302

    clock["seconds"] += 1
    assert login(client).status_code == 302
    assert client.get("/scanner").status_code == 200


def test_a_correct_pin_resets_the_wrong_pin_count(staff_app, client, clock):
    for _ in range(4):
        login(client, pin="0000")
    assert login(client).status_code == 302
    client.post("/staff/logout")
    for _ in range(4):
        assert login(client, pin="0000").status_code == 401


def test_admin_shows_totals(staff_app, staff_client, valid_form):
    register(staff_client, valid_form)
    register(staff_client, OTHER_FORM)
    staff_client.get(f"/checkin/{row(staff_app)['ticket_token']}")

    html = staff_client.get("/admin").get_data(as_text=True)
    assert '<dd id="total-registered">2</dd>' in html
    assert '<dd id="total-emails-sent">0</dd>' in html
    assert '<dd id="total-checked-in">1</dd>' in html


def test_admin_totals_are_zero_with_no_attendees(staff_client):
    html = staff_client.get("/admin").get_data(as_text=True)
    assert '<dd id="total-registered">0</dd>' in html
    assert '<dd id="total-checked-in">0</dd>' in html
    assert "Nobody has registered yet." in html


def test_admin_search_filters_the_table(staff_client, valid_form):
    register(staff_client, valid_form)
    register(staff_client, OTHER_FORM)

    html = staff_client.get("/admin?q=MARIA").get_data(as_text=True)
    assert "maria@example.com" in html
    assert "juan@example.com" not in html
    assert "No attendee matches" in staff_client.get("/admin?q=zzz").get_data(as_text=True)


@pytest.mark.parametrize(
    "query, found",
    [
        ("100%", True),
        ("%", True),
        ("50%", False),
        ("r_d", True),
        ("r_and", False),
        ("_", True),
        ("lab\\", True),
        ("R_D LAB", True),
    ],
)
def test_admin_search_treats_wildcards_as_plain_text(staff_client, valid_form, query, found):
    register(staff_client, {**valid_form, "organization": "100% R_D Lab\\"})
    register(staff_client, OTHER_FORM)
    html = staff_client.get("/admin", query_string={"q": query}).get_data(as_text=True)
    assert ("juan@example.com" in html) is found
    assert "maria@example.com" not in html


def test_admin_totals_count_sent_emails_and_checkins(staff_app, staff_client, valid_form):
    register(staff_client, valid_form)
    register(staff_client, OTHER_FORM)
    staff_client.get(f"/checkin/{row(staff_app)['ticket_token']}")
    with staff_app.app_context():
        get_db().execute("UPDATE attendees SET email_status = 'sent'")
        get_db().commit()
        assert totals(row(staff_app)["event_id"]) == {"registered": 2, "emails_sent": 2, "checked_in": 1}


def test_admin_manual_checkin(staff_app, staff_client, token):
    attendee_id = row(staff_app)["id"]
    response = staff_client.post(f"/admin/checkin/{attendee_id}", follow_redirects=True)
    assert "Juan Dela Cruz (SEM-2026-0001) checked in." in response.get_data(as_text=True)
    assert row(staff_app)["checked_in"] == 1

    set_first_checkin_time(staff_app, FIRST_CHECKIN_UTC)
    again = staff_client.post(f"/admin/checkin/{attendee_id}", follow_redirects=True)
    html = again.get_data(as_text=True)
    assert f"SEM-2026-0001 was already checked in at {FIRST_CHECKIN_SHOWN}." in html
    assert f'<span class="pill pill-sent">{FIRST_CHECKIN_SHOWN}</span>' in html


def test_admin_manual_checkin_unknown_attendee(staff_client):
    assert staff_client.post("/admin/checkin/999").status_code == 404


def test_admin_resend_sends_the_ticket(staff_app, staff_client, token, monkeypatch):
    sent_to = []
    staff_app.config["MAIL_ENABLED"] = True
    monkeypatch.setattr(
        registration, "send_ticket_email", lambda attendee: sent_to.append(attendee["email"]) or True
    )

    response = staff_client.post(f"/admin/resend/{row(staff_app)['id']}", follow_redirects=True)
    assert "Ticket for SEM-2026-0001 sent to juan@example.com." in response.get_data(as_text=True)
    assert sent_to == ["juan@example.com"]
    assert row(staff_app)["email_status"] == "sent"


def test_admin_resend_reports_a_failed_send(staff_app, staff_client, token, monkeypatch):
    def fail(_attendee):
        raise OSError("network down")

    staff_app.config["MAIL_ENABLED"] = True
    monkeypatch.setattr(registration, "send_ticket_email", fail)

    response = staff_client.post(f"/admin/resend/{row(staff_app)['id']}", follow_redirects=True)
    assert "Sending the ticket for SEM-2026-0001 failed." in response.get_data(as_text=True)
    assert row(staff_app)["email_status"] == "failed"


def test_admin_resend_explains_when_mail_is_disabled(staff_app, staff_client, token):
    response = staff_client.post(f"/admin/resend/{row(staff_app)['id']}", follow_redirects=True)
    assert "MAIL_ENABLED is off" in response.get_data(as_text=True)


def test_csv_export_lists_every_attendee(staff_app, staff_client, valid_form):
    register(staff_client, valid_form)
    register(staff_client, OTHER_FORM)
    staff_client.get(f"/checkin/{row(staff_app)['ticket_token']}")
    set_first_checkin_time(staff_app, FIRST_CHECKIN_UTC)
    set_created_time(staff_app, "2026-11-01T17:30:00+00:00")

    response = staff_client.get("/admin/export.csv")
    assert response.mimetype == "text/csv"
    assert "attachment; filename=test-seminar-attendees.csv" in response.headers["Content-Disposition"]

    rows = list(csv.DictReader(io.StringIO(response.get_data(as_text=True))))
    assert [r["attendee_code"] for r in rows] == ["SEM-2026-0001", "SEM-2026-0002"]
    assert rows[0]["event_name"] == "Test Seminar"
    assert rows[0]["full_name"] == "Juan Dela Cruz"
    assert rows[0]["contact_number"] == "+639171234567"
    assert rows[0]["checked_in"] == "1"
    assert rows[0]["checked_in_at"] == FIRST_CHECKIN_SHOWN
    assert rows[0]["created_at"] == "Nov 2, 2026 1:30 AM"
    assert rows[0]["email_sent_at"] == ""
    assert rows[1]["checked_in"] == "0"
    assert rows[1]["checked_in_at"] == ""
    assert "ticket_token" not in rows[0]


def test_csv_export_neutralizes_spreadsheet_formulas(staff_client, valid_form):
    register(staff_client, {**valid_form, "organization": "=HYPERLINK(\"http://evil\")"})
    rows = list(csv.DictReader(io.StringIO(staff_client.get("/admin/export.csv").get_data(as_text=True))))
    assert rows[0]["organization"] == "'=HYPERLINK(\"http://evil\")"


def test_lan_url_command_prints_the_address(app, monkeypatch):
    monkeypatch.setattr(commands, "lan_ip", lambda: "192.168.1.23")
    result = app.test_cli_runner().invoke(args=["lan-url", "--port", "5001"])
    assert result.exit_code == 0
    assert "LAN address: http://192.168.1.23:5001" in result.output
    assert "PUBLIC_BASE_URL=http://192.168.1.23:5001" in result.output
