import pytest

from app import create_app
from app.db import get_db, init_db


def fetch_all(app):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()


def test_index_shows_event_details_and_form(client):
    html = client.get("/").get_data(as_text=True)
    assert "Test Seminar" in html
    assert "November 30, 2026" in html
    assert "Main Hall" in html
    for name in ("full_name", "email", "organization", "contact_number"):
        assert f'name="{name}"' in html


def test_valid_submission_saves_row(client, app, valid_form):
    response = client.post("/register", data=valid_form)
    assert response.status_code == 302
    assert response.headers["Location"].endswith("/registered/SEM-2026-0001")

    rows = fetch_all(app)
    assert len(rows) == 1
    row = rows[0]
    assert row["full_name"] == "Juan Dela Cruz"
    assert row["email"] == "juan@example.com"
    assert row["organization"] == "PUP"
    assert row["contact_number"] == "+639171234567"
    assert row["qr_path"].endswith("SEM-2026-0001.png")
    assert row["email_status"] == "pending"
    assert row["checked_in"] == 0
    assert row["created_at"]


def test_confirmation_page_shows_summary(client, valid_form):
    response = client.post("/register", data=valid_form, follow_redirects=True)
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "SEM-2026-0001" in html
    assert "Juan Dela Cruz" in html
    assert "+639171234567" in html


def test_unknown_attendee_code_is_404(client):
    assert client.get("/registered/SEM-2026-9999").status_code == 404


@pytest.mark.parametrize("missing", ["full_name", "email", "organization", "contact_number"])
def test_missing_required_field_is_rejected(client, app, valid_form, missing):
    valid_form[missing] = "   "
    response = client.post("/register", data=valid_form)
    assert response.status_code == 400
    assert "is required." in response.get_data(as_text=True)
    assert fetch_all(app) == []


@pytest.mark.parametrize("email", ["juan", "juan@", "juan@example", "ju an@example.com"])
def test_bad_email_is_rejected(client, app, valid_form, email):
    valid_form["email"] = email
    response = client.post("/register", data=valid_form)
    assert response.status_code == 400
    assert "Enter a valid email address" in response.get_data(as_text=True)
    assert fetch_all(app) == []


@pytest.mark.parametrize("phone", ["12345", "0917123456", "091712345678", "08171234567", "+63817123456", "abcdefghijk"])
def test_bad_phone_is_rejected(client, app, valid_form, phone):
    valid_form["contact_number"] = phone
    response = client.post("/register", data=valid_form)
    assert response.status_code == 400
    assert "Enter a PH mobile number" in response.get_data(as_text=True)
    assert fetch_all(app) == []


@pytest.mark.parametrize("phone", ["09171234567", "+639171234567", " 0917 123 4567 ", "0917-123-4567"])
def test_phone_is_normalized(client, app, valid_form, phone):
    valid_form["contact_number"] = phone
    client.post("/register", data=valid_form)
    assert fetch_all(app)[0]["contact_number"] == "+639171234567"


def test_fields_are_trimmed_and_email_lowercased(client, app, valid_form):
    valid_form.update(full_name="  Juan   Dela Cruz ", email="  Juan@Example.COM ", organization=" PUP ")
    client.post("/register", data=valid_form)
    row = fetch_all(app)[0]
    assert row["full_name"] == "Juan Dela Cruz"
    assert row["email"] == "juan@example.com"
    assert row["organization"] == "PUP"


def test_too_long_name_is_rejected(client, app, valid_form):
    valid_form["full_name"] = "A" * 101
    response = client.post("/register", data=valid_form)
    assert response.status_code == 400
    assert "at most 100 characters" in response.get_data(as_text=True)


def test_duplicate_email_is_rejected(client, app, valid_form):
    client.post("/register", data=valid_form)
    valid_form.update(full_name="Someone Else", email="JUAN@example.com")
    response = client.post("/register", data=valid_form)
    assert response.status_code == 400
    assert "already registered" in response.get_data(as_text=True)
    assert len(fetch_all(app)) == 1


def test_typed_values_are_kept_on_error(client, valid_form):
    valid_form["contact_number"] = "123"
    html = client.post("/register", data=valid_form).get_data(as_text=True)
    assert 'value="Juan Dela Cruz"' in html
    assert 'value="juan@example.com"' in html
    assert 'value="PUP"' in html
    assert 'value="123"' in html


def test_attendee_code_increments(client, app, valid_form):
    for i in range(3):
        valid_form["email"] = f"person{i}@example.com"
        client.post("/register", data=valid_form)
    codes = [row["attendee_code"] for row in fetch_all(app)]
    assert codes == ["SEM-2026-0001", "SEM-2026-0002", "SEM-2026-0003"]


def test_ticket_token_is_unique(client, app, valid_form):
    for i in range(5):
        valid_form["email"] = f"person{i}@example.com"
        client.post("/register", data=valid_form)
    tokens = [row["ticket_token"] for row in fetch_all(app)]
    assert len(set(tokens)) == 5
    assert all(len(token) >= 32 for token in tokens)


def test_post_without_csrf_token_is_rejected(tmp_path, valid_form):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "csrf.db"),
        "QR_DIR": str(tmp_path / "qrcodes"),
        "MAIL_ENABLED": False,
    })
    with app.app_context():
        init_db()
    response = app.test_client().post("/register", data=valid_form)
    assert response.status_code == 400
    assert fetch_all(app) == []


def test_post_with_csrf_token_is_accepted(tmp_path, valid_form):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "csrf.db"),
        "QR_DIR": str(tmp_path / "qrcodes"),
        "MAIL_ENABLED": False,
    })
    with app.app_context():
        init_db()
    client = app.test_client()
    client.get("/")
    with client.session_transaction() as session:
        token = session["_csrf_token"]
    response = client.post("/register", data={**valid_form, "csrf_token": token})
    assert response.status_code == 302
