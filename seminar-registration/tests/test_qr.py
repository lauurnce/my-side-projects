import os

from app.db import get_db
from app.services.qr import checkin_url


def register(client, form, **changes):
    return client.post("/register", data={**form, **changes})


def get_row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = ?", (email,)).fetchone()


def test_checkin_url_uses_public_base_url(app):
    with app.app_context():
        assert checkin_url("abc123") == "http://localhost:5000/checkin/abc123"


def test_checkin_url_ignores_trailing_slash(app):
    app.config["PUBLIC_BASE_URL"] = "http://192.168.1.5:5000/"
    with app.app_context():
        assert checkin_url("abc123") == "http://192.168.1.5:5000/checkin/abc123"


def test_qr_file_created_on_registration(client, app, valid_form):
    register(client, valid_form)
    row = get_row(app)
    assert row["qr_path"].endswith("SEM-2026-0001.png")
    assert os.path.isfile(row["qr_path"])
    with open(row["qr_path"], "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n"
