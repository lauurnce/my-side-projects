import os

import pytest
from PIL import Image

from app.db import get_db
from app.services.qr import checkin_url


def register(client, form, **changes):
    return client.post("/register", data={**form, **changes})


def get_row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = ?", (email,)).fetchone()


def decode_qr(path):
    cv2 = pytest.importorskip("cv2")
    data, _points, _straight = cv2.QRCodeDetector().detectAndDecode(cv2.imread(path))
    return data


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


def test_qr_image_has_label_area_under_code(client, app, valid_form):
    register(client, valid_form)
    with Image.open(get_row(app)["qr_path"]) as image:
        assert image.height > image.width


def test_two_registrations_give_different_files_and_tokens(client, app, valid_form):
    register(client, valid_form, email="a@example.com")
    register(client, valid_form, email="b@example.com")
    first, second = get_row(app, "a@example.com"), get_row(app, "b@example.com")
    assert first["ticket_token"] != second["ticket_token"]
    assert first["qr_path"] != second["qr_path"]
    assert os.path.isfile(first["qr_path"]) and os.path.isfile(second["qr_path"])


def test_decoded_qr_is_exact_checkin_url(client, app, valid_form):
    register(client, valid_form)
    row = get_row(app)
    assert decode_qr(row["qr_path"]) == f"http://localhost:5000/checkin/{row['ticket_token']}"


def test_ticket_route_returns_png(client, app, valid_form):
    register(client, valid_form)
    response = client.get(f"/ticket/{get_row(app)['ticket_token']}.png")
    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert response.data.startswith(b"\x89PNG")


def test_ticket_route_unknown_token_is_404(client):
    assert client.get("/ticket/not-a-real-token.png").status_code == 404


def test_ticket_download_is_sent_as_attachment(client, app, valid_form):
    register(client, valid_form)
    response = client.get(f"/ticket/{get_row(app)['ticket_token']}.png?download=1")
    disposition = response.headers["Content-Disposition"]
    assert disposition.startswith("attachment")
    assert "SEM-2026-0001.png" in disposition
