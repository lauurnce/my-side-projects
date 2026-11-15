import pytest
from flask import jsonify, request, url_for

from app import create_app
from app.config import DEFAULT_SECRET_KEY
from app.db import init_db
from app.security import CONTENT_SECURITY_POLICY
from app.services.accounts import change_password, create_account

STAFF = {"email": "staff@example.com", "password": "correct-horse-battery"}
PROXY_HEADERS = {
    "X-Forwarded-For": "203.0.113.7",
    "X-Forwarded-Proto": "https",
    "X-Forwarded-Host": "quadra.example",
}


def build_app(tmp_path, **overrides):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "security.db"),
        "CSRF_ENABLED": False,
        "MAIL_ENABLED": False,
        "TODAY": "2026-11-01",
        **overrides,
    })
    with app.app_context():
        init_db()
        change_password(create_account(STAFF["email"], "admin", "Sam Staff")["id"], STAFF["password"])
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


@pytest.mark.parametrize("secret_key", [DEFAULT_SECRET_KEY, ""])
def test_production_refuses_a_missing_or_default_secret_key(tmp_path, secret_key):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        build_app(tmp_path, PRODUCTION=True, SECRET_KEY=secret_key)


def test_development_starts_with_the_default_secret_key(tmp_path):
    app = build_app(tmp_path, SECRET_KEY=DEFAULT_SECRET_KEY)
    assert app.config["PRODUCTION"] is False


def test_production_session_cookie_is_locked_down(production_app):
    response = production_app.test_client().post("/staff/login", data=STAFF)
    cookie = session_cookie(response)
    assert "Secure" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert "Expires=" in cookie


def test_development_session_cookie_works_over_plain_http(tmp_path):
    client = build_app(tmp_path).test_client()
    cookie = session_cookie(client.post("/staff/login", data=STAFF))
    assert "Secure" not in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert client.get("/admin").status_code == 200


def test_visitors_without_a_session_get_no_cookie(client):
    assert "Set-Cookie" not in client.get("/health").headers


def test_one_trusted_proxy_hop_supplies_the_address_and_scheme(tmp_path):
    app = build_app(tmp_path, TRUSTED_PROXY_HOPS=1)
    add_request_echo(app)
    seen = app.test_client().get("/echo", headers=PROXY_HEADERS).get_json()
    assert seen == {"address": "203.0.113.7", "home": "https://localhost/"}


@pytest.mark.parametrize("production", [False, True])
def test_proxy_headers_are_ignored_without_a_trusted_hop(tmp_path, production):
    app = build_app(tmp_path, PRODUCTION=production, SECRET_KEY="a-long-random-production-key")
    add_request_echo(app)
    seen = app.test_client().get("/echo", headers=PROXY_HEADERS).get_json()
    assert seen == {"address": "127.0.0.1", "home": "http://localhost/"}


def test_only_the_nearest_proxy_hop_is_believed(tmp_path):
    app = build_app(tmp_path, TRUSTED_PROXY_HOPS=1)
    add_request_echo(app)
    forged_then_real = {"X-Forwarded-For": "10.9.9.9, 203.0.113.7"}
    assert app.test_client().get("/echo", headers=forged_then_real).get_json()["address"] == "203.0.113.7"


@pytest.mark.parametrize("path", ["/", "/health", "/staff/login", "/staff/forgot", "/admin", "/static/css/style.css", "/no-such-page"])
def test_every_response_carries_the_security_headers(client, path):
    headers = client.get(path).headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "same-origin"
    assert headers["Content-Security-Policy"] == CONTENT_SECURITY_POLICY


def test_post_responses_carry_the_security_headers(client):
    assert "Content-Security-Policy" in client.post("/staff/logout").headers


def test_permissions_policy_keeps_the_camera_for_this_site_only(client):
    policy = client.get("/").headers["Permissions-Policy"]
    assert "camera=(self)" in policy
    assert "microphone=()" in policy
    assert "geolocation=()" in policy


def test_content_security_policy_allows_only_what_the_pages_load():
    directives = dict(part.split(" ", 1) for part in CONTENT_SECURITY_POLICY.split("; "))
    assert directives["default-src"] == "'self'"
    assert directives["script-src"] == "'self' https://unpkg.com/html5-qrcode@2.3.8/"
    assert directives["style-src"] == "'self' https://fonts.googleapis.com"
    assert directives["font-src"] == "https://fonts.gstatic.com"
    assert directives["img-src"] == "'self'"
    assert directives["object-src"] == "'none'"
    assert directives["frame-ancestors"] == "'none'"
    assert "unsafe-inline" not in CONTENT_SECURITY_POLICY
    assert "unsafe-eval" not in CONTENT_SECURITY_POLICY


def test_hsts_is_sent_in_production_only(production_app, client):
    production_headers = production_app.test_client().get("/health").headers
    assert production_headers["Strict-Transport-Security"] == "max-age=31536000"
    assert "Strict-Transport-Security" not in client.get("/health").headers
