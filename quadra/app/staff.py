import csv
import io
import math
import secrets
from functools import wraps
from time import monotonic

from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from .services.checkin import check_in, extract_token, search_attendees, totals
from .services.events import (
    create_event,
    get_event_by_slug,
    list_events,
    list_upcoming,
    validate_event,
)
from .services.registration import deliver_ticket, get_attendee_by_id

bp = Blueprint("staff", __name__)

SESSION_KEY = "staff"
MAX_WRONG_PINS = 5
LOCK_SECONDS = 60
FORMULA_STARTERS = ("=", "+", "-", "@", "\t", "\r")
CSV_COLUMNS = (
    "event_name",
    "attendee_code",
    "full_name",
    "email",
    "organization",
    "contact_number",
    "email_status",
    "email_sent_at",
    "checked_in",
    "checked_in_at",
    "created_at",
)
USER_TYPED_COLUMNS = ("event_name", "full_name", "email", "organization")


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


@bp.get("/checkin/<token>")
@staff_required
def checkin(token):
    status, attendee = check_in(token)
    http_status = 404 if status == "invalid" else 200
    return render_template("checkin_result.html", status=status, attendee=attendee), http_status


@bp.get("/scanner")
@staff_required
def scanner():
    return render_template("scanner.html")


@bp.post("/api/checkin")
@staff_required
def api_checkin():
    payload = request.get_json(silent=True) or {}
    status, attendee = check_in(extract_token(str(payload.get("code", ""))))
    if attendee is None:
        return jsonify(status=status)
    return jsonify(
        status=status,
        name=attendee["full_name"],
        code=attendee["attendee_code"],
        checked_in_at=attendee["checked_in_at"],
    )


def selected_event(slug):
    if slug:
        return get_event_by_slug(slug)
    upcoming = list_upcoming()
    if upcoming:
        return upcoming[0]
    events = list_events()
    return events[-1] if events else None


def admin_page(event, query="", new_event=None, errors=None, status=200):
    return render_template(
        "admin.html",
        events=list_events(),
        event=event,
        totals=totals(event["id"]) if event else None,
        attendees=search_attendees(event["id"], query) if event else [],
        query=query,
        new_event=new_event or {},
        errors=errors or {},
        public_base_url=current_app.config["PUBLIC_BASE_URL"],
    ), status


@bp.get("/admin")
@staff_required
def admin():
    slug = request.args.get("event", "")
    event = selected_event(slug)
    if slug and event is None:
        abort(404)
    return admin_page(event, request.args.get("q", ""))


@bp.post("/admin/events")
@staff_required
def admin_create_event():
    data, errors = validate_event(request.form)
    if errors:
        return admin_page(selected_event(""), new_event=request.form, errors=errors, status=400)
    event = create_event(**data)
    flash(f"{event['name']} was added.", "success")
    return redirect(url_for("staff.admin", event=event["slug"]))


def attendee_or_404(attendee_id):
    attendee = get_attendee_by_id(attendee_id)
    if attendee is None:
        abort(404)
    return attendee


def back_to_admin(attendee):
    return redirect(
        url_for("staff.admin", event=attendee["event_slug"], q=request.form.get("q") or None)
    )


@bp.post("/admin/checkin/<int:attendee_id>")
@staff_required
def admin_checkin(attendee_id):
    attendee = attendee_or_404(attendee_id)
    status, attendee = check_in(attendee["ticket_token"])
    if status == "checked_in":
        flash(f"{attendee['full_name']} ({attendee['attendee_code']}) checked in.", "success")
    else:
        flash(f"{attendee['attendee_code']} was already checked in at {attendee['checked_in_at']}.", "warning")
    return back_to_admin(attendee)


@bp.post("/admin/resend/<int:attendee_id>")
@staff_required
def admin_resend(attendee_id):
    attendee = attendee_or_404(attendee_id)
    if not current_app.config["MAIL_ENABLED"]:
        deliver_ticket(attendee)
        flash("MAIL_ENABLED is off, so the email was logged instead of sent.", "warning")
        return back_to_admin(attendee)
    attendee = deliver_ticket(attendee)
    if attendee["email_status"] == "sent":
        flash(f"Ticket for {attendee['attendee_code']} sent to {attendee['email']}.", "success")
    else:
        flash(f"Sending the ticket for {attendee['attendee_code']} failed. Check the log.", "error")
    return back_to_admin(attendee)


def csv_cell(column, value):
    text = "" if value is None else str(value)
    if column in USER_TYPED_COLUMNS and text.startswith(FORMULA_STARTERS):
        return "'" + text
    return text


@bp.get("/admin/export.csv")
@staff_required
def export_csv():
    event = selected_event(request.args.get("event", ""))
    if event is None:
        abort(404)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for attendee in search_attendees(event["id"]):
        writer.writerow(csv_cell(column, attendee[column]) for column in CSV_COLUMNS)
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={event['slug']}-attendees.csv"},
    )
