from app.db import get_db


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
    assert row["qr_path"] is None
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
