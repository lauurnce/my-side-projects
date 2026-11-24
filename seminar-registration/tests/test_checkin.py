
import pytest
from app import staff
from app.db import get_db

PIN = "4321"
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
    assert client.post("/register", data=form).status_code == 302


def row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = ?", (email,)).fetchone()


@pytest.fixture
def token(staff_app, client, valid_form):
    register(client, valid_form)
    return row(staff_app)["ticket_token"]


def set_first_checkin_time(app, value):
    with app.app_context():
        get_db().execute("UPDATE attendees SET checked_in_at = ?", (value,))
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
    set_first_checkin_time(staff_app, "2026-11-30 08:15:00")

    response = staff_client.get(f"/checkin/{token}")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "ALREADY CHECKED IN at 2026-11-30 08:15:00" in html
    assert "status-already" in html
    assert row(staff_app)["checked_in_at"] == "2026-11-30 08:15:00"


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
    set_first_checkin_time(staff_app, "2026-11-30 08:15:00")

    body = staff_client.post("/api/checkin", json={"code": token}).get_json()
    assert body["status"] == "already"
    assert body["checked_in_at"] == "2026-11-30 08:15:00"
    assert row(staff_app)["checked_in_at"] == "2026-11-30 08:15:00"


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
