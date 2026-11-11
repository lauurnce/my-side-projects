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
