from io import BytesIO

import pytest
from PIL import Image

from app import routes
from app.db import get_db
from app.services import mailer
from app.services.qr import checkin_url, ticket_png

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def register(client, form, **changes):
    return client.post("/events/test-seminar/register", data={**form, **changes})


def get_row(app, email="juan@example.com"):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees WHERE email = ?", (email,)).fetchone()


def ticket_response(client, app, email="juan@example.com", query=""):
    return client.get(f"/ticket/{get_row(app, email)['ticket_token']}.png{query}")


def decode_qr(png):
    cv2 = pytest.importorskip("cv2")
    numpy = pytest.importorskip("numpy")
    image = cv2.imdecode(numpy.frombuffer(png, numpy.uint8), cv2.IMREAD_COLOR)
    data, _points, _straight = cv2.QRCodeDetector().detectAndDecode(image)
    if not data:
        data, _points, _straight = cv2.QRCodeDetectorAruco().detectAndDecode(image)
    return data


def break_ticket_png(monkeypatch, module):
    def broken_ticket_png(_attendee):
        raise RuntimeError("image library broke")

    monkeypatch.setattr(module, "ticket_png", broken_ticket_png)


def test_checkin_url_uses_public_base_url(app):
    with app.app_context():
        assert checkin_url("abc123") == "http://localhost:5000/checkin/abc123"


def test_checkin_url_ignores_trailing_slash(app):
    app.config["PUBLIC_BASE_URL"] = "http://192.168.1.5:5000/"
    with app.app_context():
        assert checkin_url("abc123") == "http://192.168.1.5:5000/checkin/abc123"


def test_ticket_png_returns_png_bytes(client, app, valid_form):
    register(client, valid_form)
    with app.app_context():
        png = ticket_png(get_row(app))
    assert isinstance(png, bytes)
    assert png.startswith(PNG_SIGNATURE)


def test_ticket_image_has_label_area_under_code(client, app, valid_form):
    register(client, valid_form)
    with Image.open(BytesIO(ticket_response(client, app).data)) as image:
        assert image.height > image.width


def test_registration_writes_no_files(client, app, valid_form, tmp_path):
    register(client, valid_form)
    ticket_response(client, app)
    assert sorted(path.name for path in tmp_path.rglob("*") if path.is_file()) == ["test.db"]


def test_two_registrations_give_different_tokens_and_images(client, app, valid_form):
    register(client, valid_form, email="a@example.com")
    register(client, valid_form, email="b@example.com")
    first, second = get_row(app, "a@example.com"), get_row(app, "b@example.com")
    assert first["ticket_token"] != second["ticket_token"]
    assert (
        ticket_response(client, app, "a@example.com").data
        != ticket_response(client, app, "b@example.com").data
    )


def test_decoded_qr_is_exact_checkin_url(client, app, valid_form):
    register(client, valid_form)
    token = get_row(app)["ticket_token"]
    served = ticket_response(client, app).data
    assert decode_qr(served) == f"http://localhost:5000/checkin/{token}"


def test_decoded_qr_follows_public_base_url(client, app, valid_form):
    register(client, valid_form)
    app.config["PUBLIC_BASE_URL"] = "http://192.168.1.5:5000"
    token = get_row(app)["ticket_token"]
    served = ticket_response(client, app).data
    assert decode_qr(served) == f"http://192.168.1.5:5000/checkin/{token}"


def test_ticket_route_returns_png(client, app, valid_form):
    register(client, valid_form)
    response = ticket_response(client, app)
    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert response.data.startswith(PNG_SIGNATURE)


def test_ticket_route_shows_image_inline_by_default(client, app, valid_form):
    register(client, valid_form)
    disposition = ticket_response(client, app).headers["Content-Disposition"]
    assert disposition.startswith("inline")
    assert "SEM-2026-0001.png" in disposition


def test_ticket_route_is_cached_privately(client, app, valid_form):
    register(client, valid_form)
    cache_control = ticket_response(client, app).cache_control
    assert cache_control.private
    assert not cache_control.public
    assert cache_control.max_age == 300


def test_ticket_route_unknown_token_is_404(client):
    assert client.get("/ticket/not-a-real-token.png").status_code == 404


def test_ticket_download_is_sent_as_attachment(client, app, valid_form):
    register(client, valid_form)
    response = ticket_response(client, app, query="?download=1")
    disposition = response.headers["Content-Disposition"]
    assert disposition.startswith("attachment")
    assert "SEM-2026-0001.png" in disposition
    assert response.data.startswith(PNG_SIGNATURE)


def test_qr_failure_keeps_registration(client, app, valid_form, monkeypatch):
    break_ticket_png(monkeypatch, mailer)
    response = register(client, valid_form)
    assert response.status_code == 302
    assert response.headers["Location"].endswith("/registered/SEM-2026-0001")
    assert get_row(app) is not None


def test_qr_failure_marks_email_failed_and_logs(client, app, valid_form, monkeypatch, caplog):
    break_ticket_png(monkeypatch, mailer)
    register(client, valid_form)
    assert get_row(app)["email_status"] == "failed"
    assert "Ticket email failed for SEM-2026-0001" in caplog.text
    assert "image library broke" in caplog.text


def test_qr_failure_still_shows_confirmation_page(client, valid_form, monkeypatch):
    break_ticket_png(monkeypatch, mailer)
    response = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True)
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "SEM-2026-0001" in html
    assert "We couldn't email your ticket" in html


def test_ticket_route_is_503_when_qr_fails(client, app, valid_form, monkeypatch, caplog):
    register(client, valid_form)
    break_ticket_png(monkeypatch, routes)
    response = ticket_response(client, app)
    assert response.status_code == 503
    assert response.mimetype != "image/png"
    assert "max-age" not in response.headers.get("Cache-Control", "")
    assert "QR generation failed for SEM-2026-0001" in caplog.text


def test_ticket_route_recovers_after_qr_failure(client, app, valid_form, monkeypatch):
    register(client, valid_form)
    break_ticket_png(monkeypatch, routes)
    assert ticket_response(client, app).status_code == 503
    monkeypatch.undo()
    assert ticket_response(client, app).status_code == 200


def test_registered_page_shows_qr_and_download_button(client, app, valid_form):
    html = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True).get_data(as_text=True)
    token = get_row(app)["ticket_token"]
    assert f'src="/ticket/{token}.png"' in html
    assert f'href="/ticket/{token}.png?download=1"' in html
    assert "Download ticket" in html


def test_registered_page_hidden_from_other_browsers(app, valid_form):
    app.test_client().post("/events/test-seminar/register", data=valid_form)
    assert app.test_client().get("/registered/SEM-2026-0001").status_code == 404
