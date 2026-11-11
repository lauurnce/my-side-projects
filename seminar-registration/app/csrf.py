import secrets

from flask import session

SESSION_KEY = "_csrf_token"


def get_csrf_token():
    if SESSION_KEY not in session:
        session[SESSION_KEY] = secrets.token_urlsafe(32)
    return session[SESSION_KEY]


def init_app(app):
    app.jinja_env.globals["csrf_token"] = get_csrf_token
