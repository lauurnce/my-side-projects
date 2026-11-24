from flask import session
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import DEFAULT_SECRET_KEY


def require_private_secret_key(app):
    secret_key = app.config["SECRET_KEY"]
    if not secret_key or secret_key == DEFAULT_SECRET_KEY:
        raise RuntimeError("Set SECRET_KEY to a long random value before running in production.")


def harden_for_production(app):
    require_private_secret_key(app)
    app.config["SESSION_COOKIE_SECURE"] = True
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


def init_app(app):
    if app.config["PRODUCTION"]:
        harden_for_production(app)

    @app.after_request
    def expire_session_after_its_lifetime(response):
        if session and not session.permanent:
            session.permanent = True
        return response
