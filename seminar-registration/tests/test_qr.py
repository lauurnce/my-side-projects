from app.services.qr import checkin_url


def test_checkin_url_uses_public_base_url(app):
    with app.app_context():
        assert checkin_url("abc123") == "http://localhost:5000/checkin/abc123"


def test_checkin_url_ignores_trailing_slash(app):
    app.config["PUBLIC_BASE_URL"] = "http://192.168.1.5:5000/"
    with app.app_context():
        assert checkin_url("abc123") == "http://192.168.1.5:5000/checkin/abc123"
