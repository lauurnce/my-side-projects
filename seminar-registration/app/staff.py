import secrets
from functools import wraps

from flask import (
    Blueprint,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

bp = Blueprint("staff", __name__)

SESSION_KEY = "staff"


def staff_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get(SESSION_KEY):
            return view(*args, **kwargs)
        if request.path.startswith("/api/"):
            return jsonify(status="login_required"), 401
        if request.method != "GET":
            return redirect(url_for("staff.login", next=url_for("staff.admin")))
        return redirect(url_for("staff.login", next=request.full_path.rstrip("?")))

    return wrapped


def safe_next(target):
    if target and target.startswith("/") and not target.startswith("//") and "\\" not in target:
        return target
    return url_for("staff.scanner")


def pin_matches(pin):
    return secrets.compare_digest(pin.encode(), current_app.config["STAFF_PIN"].encode())


def login_page(next_url, error=None, status=200):
    return render_template("staff_login.html", next_url=next_url, error=error), status


@bp.route("/staff/login", methods=["GET", "POST"])
def login():
    next_url = safe_next(request.values.get("next"))
    if request.method == "GET":
        return login_page(next_url)
    if not current_app.config["STAFF_PIN"]:
        return login_page(next_url, "Staff login is off. Set STAFF_PIN in .env and restart.", 503)

    if pin_matches(request.form.get("pin", "")):
        session[SESSION_KEY] = True
        return redirect(next_url)
    return login_page(next_url, "Wrong PIN.", 401)


@bp.post("/staff/logout")
def logout():
    session.pop(SESSION_KEY, None)
    return redirect(url_for("staff.login"))
