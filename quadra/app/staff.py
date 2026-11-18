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
from .services.delivery import EMAIL_BATCH_SIZE, EMAIL_NAMES, send_emails
from .services.events import (
    create_event,
    delete_event_without_registrations,
    get_event_with_people,
    list_events,
    save_event_details,
    today,
    update_event,
    validate_event,
)
from .services.registration import get_attendee_by_id
from .services.review import DECISIONS, STATES, decide

bp = Blueprint("staff", __name__)

FORMULA_STARTERS = ("=", "+", "-", "@", "\t", "\r")
CSV_COLUMNS = (
    "event_name",
    "attendee_code",
    "full_name",
    "email",
    "organization",
    "contact_number",
    "state",
    "decided_at",
    "decided_by",
    "email_status",
    "email_sent_at",
    "checked_in",
    "checked_in_at",
    "checked_in_by",
    "created_at",
    "consented_at",
)
USER_TYPED_COLUMNS = ("event_name", "full_name", "email", "organization", "decided_by", "checked_in_by")
TIME_COLUMNS = ("decided_at", "email_sent_at", "checked_in_at", "created_at", "consented_at")
ALL_PENDING = "-pending"
MAIL_OFF_MSG = "MAIL_ENABLED is off, so the email was logged instead of sent."
HELD_BACK_MSG = "This test copy only emails addresses on its allowlist."
EVENT_SWITCHES = {
    "publish": ({"published": 1}, "{name} is published."),
    "unpublish": ({"published": 0}, "{name} is a draft now. Only staff can see it."),
    "close": ({"registration_closed": 1}, "Registration for {name} is closed."),
    "reopen": ({"registration_closed": 0}, "Registration for {name} follows its dates again."),
}


@bp.get("/checkin/<token>")
@staff_required
def checkin(token):
    status, attendee = check_in(token, current_account()["id"])
    http_status = {"invalid": 404, "not_accepted": 403}.get(status, 200)
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
        state=attendee["state"],
        checked_in_at=manila_time(attendee["checked_in_at"]),
    )


def selected_event(events, slug=""):
    if slug:
        return next((event for event in events if event["slug"] == slug), None)
    current = today().isoformat()
    upcoming = [event for event in events if event["event_date"] >= current]
    if upcoming:
        return upcoming[0]
    return events[-1] if events else None


def admin_page(events, event, query="", state="", new_event=None, errors=None, status=200):
    return render_template(
        "admin.html",
        events=events,
        event=event,
        totals=totals(event["id"]) if event else None,
        attendees=search_attendees(event["id"], query, state) if event else [],
        query=query,
        shown_state=state,
        states=STATES,
        batch_size=EMAIL_BATCH_SIZE,
        new_event=new_event or {},
        errors=errors or {},
        public_base_url=current_app.config["PUBLIC_BASE_URL"],
    ), status


@bp.get("/admin")
@staff_required
def admin():
    slug = request.args.get("event", "")
    events = list_events()
    event = selected_event(events, slug)
    if slug and event is None:
        abort(404)
    state = request.args.get("state", "")
    return admin_page(events, event, request.args.get("q", ""), state if state in STATES else "")


@bp.post("/admin/events")
@staff_required
def admin_create_event():
    data, errors = validate_event(request.form)
    if errors:
        events = list_events()
        return admin_page(events, selected_event(events), new_event=request.form, errors=errors, status=400)
    published = request.form.get("visibility") != "draft"
    event = create_event(**data, created_by_id=current_account()["id"], published=published)
    flash(f"{event['name']} was {'added' if published else 'saved as a draft'}.", "success")
    return redirect(url_for("staff.admin", event=event["slug"]))


def back_to_event(slug):
    return redirect(
        url_for(
            "staff.admin",
            event=slug,
            q=request.form.get("q") or None,
            state=request.form.get("state") or None,
        )
    )


def flash_email_result(result):
    if result["logged"]:
        flash(MAIL_OFF_MSG, "warning")
    if result["sent"]:
        flash(f"{result['sent']} {'email' if result['sent'] == 1 else 'emails'} sent.", "success")
    if result["failed"]:
        flash(f"{result['failed']} could not be emailed. Retry them from the email queue.", "error")
    if result["held"]:
        flash(f"{result['held']} held back, not sent. {HELD_BACK_MSG}", "warning")


def chosen_ids():
    return [int(value) for value in request.form.getlist("ids") if value.isdecimal()]


@bp.post("/admin/events/<slug>/decide")
@staff_required
def admin_decide(slug):
    event = event_or_404(slug)
    action = request.form.get("action", "")
    decision = action.removesuffix(ALL_PENDING)
    if decision not in DECISIONS:
        abort(400)
    attendee_ids = None if action.endswith(ALL_PENDING) else chosen_ids()
    if attendee_ids == []:
        flash("Tick at least one person first.", "warning")
        return back_to_event(slug)
    state = DECISIONS[decision]
    decided = decide(event["id"], state, current_account()["id"], attendee_ids)
    skipped = len(attendee_ids) - len(decided) if attendee_ids else 0
    flash(f"{len(decided)} {state}.", "success" if decided else "warning")
    if skipped:
        flash(f"{skipped} left as they were: already {state}, or already checked in.", "warning")
    flash_email_result(send_emails(event["id"], attendee_ids=decided))
    return back_to_event(slug)


@bp.post("/admin/events/<slug>/emails")
@staff_required
def admin_send_emails(slug):
    event = event_or_404(slug)
    which = "failed" if request.form.get("which") == "failed" else "waiting"
    result = send_emails(event["id"], which)
    if not any(result.values()):
        flash("There was nothing to send.", "warning")
    flash_email_result(result)
    return back_to_event(slug)


def event_or_404(slug):
    event = get_event_with_people(slug)
    if event is None:
        abort(404)
    return event


@bp.get("/admin/events/<slug>/edit")
@staff_required
def admin_edit_event(slug):
    event = event_or_404(slug)
    return render_template("event_edit.html", event=event, values=event, errors={})


@bp.post("/admin/events/<slug>/edit")
@staff_required
def admin_save_event(slug):
    event = event_or_404(slug)
    data, errors = validate_event(request.form)
    if errors:
        return render_template("event_edit.html", event=event, values=request.form, errors=errors), 400
    save_event_details(event["id"], current_account()["id"], **data)
    flash(f"{data['name']} was saved.", "success")
    return redirect(url_for("staff.admin", event=slug))


@bp.post("/admin/events/<slug>/<any(publish,unpublish,close,reopen):switch>")
@staff_required
def admin_switch_event(slug, switch):
    event = event_or_404(slug)
    columns, message = EVENT_SWITCHES[switch]
    update_event(event["id"], current_account()["id"], **columns)
    flash(message.format(name=event["name"]), "success")
    return redirect(url_for("staff.admin", event=slug))


def delete_page(event, status=200):
    registered = totals(event["id"])["registered"]
    return render_template("event_delete.html", event=event, registered=registered), status


@bp.get("/admin/events/<slug>/delete")
@staff_required
def admin_confirm_delete_event(slug):
    return delete_page(event_or_404(slug))


@bp.post("/admin/events/<slug>/delete")
@staff_required
def admin_delete_event(slug):
    event = event_or_404(slug)
    if not delete_event_without_registrations(event["id"]):
        return delete_page(event, 409)
    flash(f"{event['name']} was deleted.", "success")
    return redirect(url_for("staff.admin"))


def attendee_or_404(attendee_id):
    attendee = get_attendee_by_id(attendee_id)
    if attendee is None:
        abort(404)
    return attendee


@bp.post("/admin/checkin/<int:attendee_id>")
@staff_required
def admin_checkin(attendee_id):
    attendee = attendee_or_404(attendee_id)
    status, attendee = check_in(attendee["ticket_token"], current_account()["id"])
    if status == "checked_in":
        flash(f"{attendee['full_name']} ({attendee['attendee_code']}) checked in.", "success")
    elif status == "not_accepted":
        flash(f"{attendee['attendee_code']} is not accepted, so it cannot be checked in.", "error")
    else:
        checked_in_at = manila_time(attendee["checked_in_at"])
        flash(f"{attendee['attendee_code']} was already checked in at {checked_in_at}.", "warning")
    return back_to_event(attendee["event_slug"])


@bp.post("/admin/resend/<int:attendee_id>")
@staff_required
def admin_resend(attendee_id):
    attendee = attendee_or_404(attendee_id)
    code = attendee["attendee_code"]
    name = EMAIL_NAMES.get(attendee["state"], "email")
    result = send_emails(attendee["event_id"], "any", [attendee_id])
    if result["logged"]:
        flash(MAIL_OFF_MSG, "warning")
    elif result["sent"]:
        flash(f"{name.capitalize()} for {code} sent to {attendee['email']}.", "success")
    elif result["failed"]:
        flash(f"Sending the {name} for {code} failed. Check the log.", "error")
    elif result["held"]:
        flash(f"The {name} for {code} was held back, not sent. {HELD_BACK_MSG}", "warning")
    else:
        flash(f"Nothing was sent for {code}: it has no decision yet, or its email is being sent now.", "warning")
    return back_to_event(attendee["event_slug"])


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
    event = selected_event(list_events(), request.args.get("event", ""))
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
