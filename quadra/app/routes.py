import os

from flask import (
    Blueprint,
    abort,
    has_request_context,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)

from .services.events import get_event_by_slug, list_upcoming, registration_state
from .services.registration import (
    DuplicateEmailError,
    attach_qr,
    create_attendee,
    email_exists,
    get_attendee_by_code,
    get_attendee_by_token,
)
from .validation import validate_registration

bp = Blueprint("main", __name__)

DUPLICATE_MSG = "This email is already registered for this event. Check your inbox for your ticket."
RECENT_CODES_KEY = "registered_codes"


@bp.app_context_processor
def inject_last_ticket():
    codes = session.get(RECENT_CODES_KEY, []) if has_request_context() else []
    return {"last_ticket_code": codes[-1] if codes else None}


@bp.get("/health")
def health():
    return jsonify(status="ok")


@bp.get("/")
def index():
    events = list_upcoming()
    next_open = next((event for event in events if registration_state(event) == "open"), None)
    return render_template("index.html", events=events, next_open=next_open)


def event_or_404(slug):
    event = get_event_by_slug(slug)
    if event is None:
        abort(404)
    return event


@bp.get("/events/<slug>")
def event_page(slug):
    return render_template("event.html", event=event_or_404(slug), values={}, errors={})


@bp.post("/events/<slug>/register")
def register(slug):
    event = event_or_404(slug)
    if registration_state(event) != "open":
        abort(403, description="Registration for this event is not open.")

    data, errors = validate_registration(request.form)
    if not errors and email_exists(event["id"], data["email"]):
        errors["email"] = DUPLICATE_MSG

    if not errors:
        try:
            attendee = create_attendee(event["id"], **data)
        except DuplicateEmailError:
            errors["email"] = DUPLICATE_MSG
        else:
            code = attendee["attendee_code"]
            session[RECENT_CODES_KEY] = (session.get(RECENT_CODES_KEY, []) + [code])[-5:]
            return redirect(url_for("main.registered", code=code))

    return render_template("event.html", event=event, values=data, errors=errors), 400


@bp.get("/registered/<code>")
def registered(code):
    if code not in session.get(RECENT_CODES_KEY, []):
        abort(404)
    attendee = get_attendee_by_code(code)
    if attendee is None:
        abort(404)
    return render_template("registered.html", attendee=attendee)


@bp.get("/ticket/<token>.png")
def ticket(token):
    attendee = get_attendee_by_token(token)
    if attendee is None:
        abort(404)
    if not attendee["qr_path"] or not os.path.isfile(attendee["qr_path"]):
        attendee = attach_qr(attendee)
    path = attendee["qr_path"]
    if not path or not os.path.isfile(path):
        abort(503, description="The ticket image is not available right now.")
    return send_file(
        path,
        mimetype="image/png",
        as_attachment=request.args.get("download") == "1",
        download_name=f"{attendee['attendee_code']}.png",
    )
