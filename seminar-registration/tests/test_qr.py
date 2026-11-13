from app.services.qr import checkin_url


def test_checkin_url_uses_public_base_url(app):
    with app.app_context():
        assert checkin_url("abc123") == "http://localhost:5000/checkin/abc123"
