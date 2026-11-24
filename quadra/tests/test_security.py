import pytest
from flask import jsonify, request, url_for

from app import create_app
from app.config import DEFAULT_SECRET_KEY
from app.db import init_db

PROXY_HEADERS = {
    "X-Forwarded-For": "203.0.113.7",
    "X-Forwarded-Proto": "https",
    "X-Forwarded-Host": "quadra.example",
}


def build_app(tmp_path, **overrides):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "security.db"),
        "QR_DIR": str(tmp_path / "qrcodes"),
        "CSRF_ENABLED": False,
        "MAIL_ENABLED": False,
        "STAFF_PIN": "246810",
        "TODAY": "2026-11-01",
        **overrides,
    })
    with app.app_context():
        init_db()
    return app


def add_request_echo(app):

    def echo():
        return jsonify(address=request.remote_addr, home=url_for("main.index", _external=True))

    app.add_url_rule("/echo", view_func=echo)


@pytest.fixture
def production_app(tmp_path):
    return build_app(tmp_path, PRODUCTION=True, SECRET_KEY="a-long-random-production-key")


def session_cookie(response):
    return next(value for value in response.headers.getlist("Set-Cookie") if value.startswith("session="))


def wrong_pin(client, address):
    return client.post("/staff/login", data={"pin": "000000"}, headers={"X-Forwarded-For": address})


@pytest.mark.parametrize("secret_key", [DEFAULT_SECRET_KEY, ""])
def test_production_refuses_a_missing_or_default_secret_key(tmp_path, secret_key):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        build_app(tmp_path, PRODUCTION=True, SECRET_KEY=secret_key)


def test_development_starts_with_the_default_secret_key(tmp_path):
    app = build_app(tmp_path, SECRET_KEY=DEFAULT_SECRET_KEY)
    assert app.config["PRODUCTION"] is False


def test_production_session_cookie_is_locked_down(production_app):
    response = production_app.test_client().post("/staff/login", data={"pin": "246810"})
    cookie = session_cookie(response)
    assert "Secure" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert "Expires=" in cookie


def test_development_session_cookie_works_over_plain_http(tmp_path):
    client = build_app(tmp_path).test_client()
    cookie = session_cookie(client.post("/staff/login", data={"pin": "246810"}))
    assert "Secure" not in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert client.get("/admin").status_code == 200


def test_visitors_without_a_session_get_no_cookie(client):
    assert "Set-Cookie" not in client.get("/health").headers


def test_production_trusts_the_proxy_headers(production_app):
    add_request_echo(production_app)
    seen = production_app.test_client().get("/echo", headers=PROXY_HEADERS).get_json()
    assert seen == {"address": "203.0.113.7", "home": "https://quadra.example/"}


def test_development_ignores_proxy_headers(app, client):
    add_request_echo(app)
    seen = client.get("/echo", headers=PROXY_HEADERS).get_json()
    assert seen == {"address": "127.0.0.1", "home": "http://localhost/"}


def test_production_pin_lockout_follows_the_real_client_address(production_app):
    client = production_app.test_client()
    for _ in range(5):
        wrong_pin(client, "203.0.113.7")
    assert wrong_pin(client, "203.0.113.7").status_code == 429
    assert wrong_pin(client, "198.51.100.9").status_code == 401
