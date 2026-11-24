import secrets

from flask import abort, request, session

SESSION_KEY = "_csrf_token"


def get_csrf_token():
    if SESSION_KEY not in session:
        session[SESSION_KEY] = secrets.token_urlsafe(32)
    return session[SESSION_KEY]


def check_csrf():
    """Reject unsafe requests whose form token does not match the session."""
    if request.method != "POST":
        return
    expected = session.get(SESSION_KEY)
    sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token", "")
    if not expected or not secrets.compare_digest(expected, sent):
        abort(400, description="Your form session expired. Please reload and try again.")


def init_app(app):
    app.jinja_env.globals["csrf_token"] = get_csrf_token

    @app.before_request
    def _csrf_protect():
        if app.config.get("CSRF_ENABLED", True):
            check_csrf()
