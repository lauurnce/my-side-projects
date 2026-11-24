from flask import session
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import DEFAULT_SECRET_KEY

ALLOWED_SOURCES = {
    "default-src": "'self'",
    "script-src": "'self' https://unpkg.com/html5-qrcode@2.3.8/",
    "style-src": "'self' https://fonts.googleapis.com",
    "font-src": "https://fonts.gstatic.com",
    "img-src": "'self'",
    "connect-src": "'self'",
    "media-src": "'self'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
}
CONTENT_SECURITY_POLICY = "; ".join(f"{directive} {sources}" for directive, sources in ALLOWED_SOURCES.items())
SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
}
HSTS = "max-age=31536000"


def require_private_secret_key(app):
    secret_key = app.config["SECRET_KEY"]
    if not secret_key or secret_key == DEFAULT_SECRET_KEY:
        raise RuntimeError("Set SECRET_KEY to a long random value before running in production.")


def harden_for_production(app):
    require_private_secret_key(app)
    app.config["SESSION_COOKIE_SECURE"] = True


def trust_proxy_headers(app):
    hops = app.config["TRUSTED_PROXY_HOPS"]
    if hops > 0:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops)


def init_app(app):
    if app.config["PRODUCTION"]:
        harden_for_production(app)
    trust_proxy_headers(app)

    @app.after_request
    def expire_session_after_its_lifetime(response):
        if session and not session.permanent:
            session.permanent = True
        return response

    @app.after_request
    def add_security_headers(response):
        response.headers.update(SECURITY_HEADERS)
        if app.config["PRODUCTION"]:
            response.headers["Strict-Transport-Security"] = HSTS
        return response
