import math
import re
from functools import wraps

from flask import (
    Blueprint,
    abort,
    flash,
    g,
    has_request_context,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from . import clock
from .db import close_db
from .services.accounts import (
    MIN_PASSWORD_LENGTH,
    DuplicateAccountError,
    account_for_link,
    account_for_login,
    change_password,
    create_account,
    disable_account,
    email_forgotten_password_link,
    email_link,
    email_problem,
    enable_account,
    end_sessions,
    get_account,
    list_accounts,
    lock_seconds_left,
    name_problem,
    normalize_email,
    password_matches,
    password_problem,
    record_failed_login,
    record_login,
    use_link,
)

bp = Blueprint("accounts", __name__)

SESSION_ACCOUNT = "account_id"
SESSION_VERSION = "session_version"
WRONG_LOGIN = "Wrong email or password."
FORGOT_ANSWER = "If that email has a staff account, a link to set a new password is on its way."
FORGOT_ANSWER_SECONDS = 6
INVITE_RESULTS = {
    "sent": ("An invite was sent to {email}.", "success"),
    "logged": ("MAIL_ENABLED is off, so the invite for {email} was logged instead of sent.", "warning"),
    "failed": ("The invite for {email} could not be sent. Check the log, then resend it.", "error"),
    "off": ("Email is turned off, so the invite could not be sent to {email}. Set MAIL_ENABLED, then resend it.", "error"),
}


def sign_in(account):
    session.clear()
    session[SESSION_ACCOUNT] = account["id"]
    session[SESSION_VERSION] = account["session_version"]


def signed_in_account():
    account_id = session.get(SESSION_ACCOUNT)
    if account_id is None:
        return None
    account = get_account(account_id)
    if account and account["active"] and account["session_version"] == session.get(SESSION_VERSION):
        return account
    session.clear()
    return None


def current_account():
    if "account" not in g:
        g.account = None
        g.account = signed_in_account()
    return g.account


@bp.app_context_processor
def inject_current_account():
    return {"current_account": current_account() if has_request_context() else None}


def staff_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_account():
            return view(*args, **kwargs)
        if request.path.startswith("/api/"):
            return jsonify(status="login_required"), 401
        if request.method != "GET":
            return redirect(url_for("accounts.login", next=url_for("staff.admin")))
        return redirect(url_for("accounts.login", next=request.full_path.rstrip("?")))

    return wrapped


def owner_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_account()["role"] != "owner":
            abort(403)
        return view(*args, **kwargs)

    return staff_required(wrapped)


def safe_next(target):
    if target and target.startswith("/") and not target.startswith("//") and "\\" not in target:
        return target
    return url_for("staff.scanner")


def login_page(next_url, email="", error=None, status=200):
    return render_template("staff_login.html", next_url=next_url, email=email, error=error), status


def locked_message(seconds):
    minutes = math.ceil(seconds / 60)
    unit = "minute" if minutes == 1 else "minutes"
    return f"Too many failed attempts for this email. Try again in {minutes} {unit}."


@bp.route("/staff/login", methods=["GET", "POST"])
def login():
    next_url = safe_next(request.values.get("next"))
    if request.method == "GET":
        return login_page(next_url)
    email = normalize_email(request.form.get("email"))
    if email_problem(email):
        return login_page(next_url, email, WRONG_LOGIN, 401)
    address = request.remote_addr or ""
    if seconds := lock_seconds_left(email, address):
        return login_page(next_url, email, locked_message(seconds), 429)

    account = account_for_login(email, request.form.get("password", ""))
    if account:
        record_login(account, address)
        sign_in(account)
        return redirect(next_url)

    record_failed_login(email, address)
    if seconds := lock_seconds_left(email, address):
        return login_page(next_url, email, locked_message(seconds), 429)
    return login_page(next_url, email, WRONG_LOGIN, 401)


@bp.post("/staff/logout")
def logout():
    account = current_account()
    if account:
        end_sessions(account["id"])
    session.clear()
    return redirect(url_for("accounts.login"))


@bp.route("/staff/forgot", methods=["GET", "POST"])
def forgot():
    if request.method == "GET":
        return render_template("staff_forgot.html")
    started = clock.stopwatch()
    email_forgotten_password_link(request.form.get("email"))
    close_db()
    clock.wait(FORGOT_ANSWER_SECONDS - (clock.stopwatch() - started))
    flash(FORGOT_ANSWER, "success")
    return redirect(url_for("accounts.login"))


def set_password_page(account, name, errors=None, status=200):
    return render_template(
        "staff_set_password.html",
        account=account,
        name=name,
        errors=errors or {},
        min_password_length=MIN_PASSWORD_LENGTH,
    ), status


@bp.route("/staff/set-password/<token>", methods=["GET", "POST"])
def set_password(token):
    account = account_for_link(token)
    if account is None:
        abort(410)
    if request.method == "GET":
        return set_password_page(account, account["name"])

    invited = account["link_purpose"] == "invite"
    name = re.sub(r"\s+", " ", request.form.get("name", "")).strip() if invited else None
    password = request.form.get("password", "")
    errors = {
        "name": name_problem(name) if invited else None,
        "password": password_problem(password, request.form.get("confirmation", "")),
    }
    if any(errors.values()):
        return set_password_page(account, name, errors, 400)
    if use_link(token, password, name) is None:
        abort(410)
    flash("Your password is saved. Sign in to continue.", "success")
    return redirect(url_for("accounts.login"))


def account_page(errors=None, status=200):
    return render_template(
        "account.html", errors=errors or {}, min_password_length=MIN_PASSWORD_LENGTH
    ), status


@bp.route("/staff/account", methods=["GET", "POST"])
@staff_required
def account():
    if request.method == "GET":
        return account_page()
    password = request.form.get("password", "")
    errors = {"password": password_problem(password, request.form.get("confirmation", ""))}
    if not password_matches(current_account(), request.form.get("current_password", "")):
        errors["current_password"] = "That is not your current password."
    if any(errors.values()):
        return account_page(errors, 400)
    session[SESSION_VERSION] = change_password(current_account()["id"], password)
    flash("Your password was changed. Your other devices were signed out.", "success")
    return redirect(url_for("accounts.account"))


def team_page(invite_email="", error=None, status=200):
    return render_template(
        "team.html", accounts=list_accounts(), invite_email=invite_email, error=error
    ), status


def send_invite(account):
    message, category = INVITE_RESULTS[email_link(account)]
    flash(message.format(email=account["email"]), category)


def account_or_404(account_id):
    account = get_account(account_id)
    if account is None:
        abort(404)
    return account


@bp.get("/staff/team")
@owner_required
def team():
    return team_page()


@bp.post("/staff/team/invite")
@owner_required
def invite():
    email = normalize_email(request.form.get("email"))
    problem = email_problem(email)
    if problem:
        return team_page(email, problem, 400)
    try:
        account = create_account(email, "admin")
    except DuplicateAccountError:
        return team_page(email, "That email already has an account.", 400)
    send_invite(account)
    return redirect(url_for("accounts.team"))


@bp.post("/staff/team/<int:account_id>/resend")
@owner_required
def resend_invite(account_id):
    account = account_or_404(account_id)
    if account["password_hash"] or not account["active"]:
        abort(400, description="Only an invite that is still waiting can be sent again.")
    send_invite(account)
    return redirect(url_for("accounts.team"))


@bp.post("/staff/team/<int:account_id>/disable")
@owner_required
def disable(account_id):
    account = account_or_404(account_id)
    if account["id"] == current_account()["id"]:
        abort(403, description="You cannot disable your own account.")
    if account["active"] and not disable_account(account_id):
        abort(403, description="The last active owner cannot be disabled.")
    flash(f"{account['email']} was disabled and signed out.", "success")
    return redirect(url_for("accounts.team"))


@bp.post("/staff/team/<int:account_id>/enable")
@owner_required
def enable(account_id):
    account = account_or_404(account_id)
    enable_account(account_id)
    flash(f"{account['email']} can sign in again.", "success")
    return redirect(url_for("accounts.team"))
