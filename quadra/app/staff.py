import csv
import io

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
    url_for,
)

from .accounts import current_account, staff_required
from .clock import manila_time
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
    "checked_in_by",
    "created_at",
)
USER_TYPED_COLUMNS = ("event_name", "full_name", "email", "organization", "checked_in_by")
TIME_COLUMNS = ("email_sent_at", "checked_in_at", "created_at")


@bp.get("/checkin/<token>")
@staff_required
def checkin(token):
    status, attendee = check_in(token, current_account()["id"])
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
    status, attendee = check_in(extract_token(str(payload.get("code", ""))), current_account()["id"])
    if attendee is None:
        return jsonify(status=status)
    return jsonify(
        status=status,
        name=attendee["full_name"],
        code=attendee["attendee_code"],
        checked_in_at=manila_time(attendee["checked_in_at"]),
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
    event = create_event(**data, created_by_id=current_account()["id"])
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
    status, attendee = check_in(attendee["ticket_token"], current_account()["id"])
    if status == "checked_in":
        flash(f"{attendee['full_name']} ({attendee['attendee_code']}) checked in.", "success")
    else:
        checked_in_at = manila_time(attendee["checked_in_at"])
        flash(f"{attendee['attendee_code']} was already checked in at {checked_in_at}.", "warning")
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
    if column in TIME_COLUMNS:
        return manila_time(value)
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
