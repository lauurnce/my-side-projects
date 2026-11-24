import math
import secrets
from functools import wraps
from time import monotonic

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
MAX_WRONG_PINS = 5
LOCK_SECONDS = 60


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


def pin_attempts():
    by_address = current_app.extensions.setdefault("pin_attempts", {})
    return by_address.setdefault(request.remote_addr, {"wrong": 0, "locked_until": 0})


def seconds_locked(attempts):
    return max(0, math.ceil(attempts["locked_until"] - monotonic()))


def record_wrong_pin(attempts):
    attempts["wrong"] += 1
    if attempts["wrong"] < MAX_WRONG_PINS:
        return
    attempts["wrong"] = 0
    attempts["locked_until"] = monotonic() + LOCK_SECONDS


def pin_matches(pin):
    return secrets.compare_digest(pin.encode(), current_app.config["STAFF_PIN"].encode())


def login_page(next_url, error=None, status=200):
    return render_template("staff_login.html", next_url=next_url, error=error), status


def locked_message(seconds):
    return f"Too many wrong PINs. Try again in {seconds} seconds."


@bp.route("/staff/login", methods=["GET", "POST"])
def login():
    next_url = safe_next(request.values.get("next"))
    if request.method == "GET":
        return login_page(next_url)
    if not current_app.config["STAFF_PIN"]:
        return login_page(next_url, "Staff login is off. Set STAFF_PIN in .env and restart.", 503)

    attempts = pin_attempts()
    if seconds_locked(attempts):
        return login_page(next_url, locked_message(seconds_locked(attempts)), 429)
    if pin_matches(request.form.get("pin", "")):
        attempts["wrong"] = 0
        session[SESSION_KEY] = True
        return redirect(next_url)

    record_wrong_pin(attempts)
    if seconds_locked(attempts):
        return login_page(next_url, locked_message(seconds_locked(attempts)), 429)
    return login_page(next_url, "Wrong PIN.", 401)


@bp.post("/staff/logout")
def logout():
    session.pop(SESSION_KEY, None)
    return redirect(url_for("staff.login"))
