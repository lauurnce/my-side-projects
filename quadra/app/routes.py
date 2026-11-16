from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    has_request_context,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from .accounts import current_account
from .services.delivery import send_emails
from .services.events import get_event_by_slug, list_upcoming, registration_state
from .services.qr import ticket_png
from .services.registration import (
    DuplicateEmailError,
    create_attendee,
    email_exists,
    get_attendee_by_code,
    get_attendee_by_status_token,
    get_attendee_by_token,
    may_apply,
)
from .validation import validate_registration

bp = Blueprint("main", __name__)

DUPLICATE_MSG = (
    "This email is already registered for this event."
    " Check your inbox, or open the status link you were shown when you applied."
)
NOT_SUBMITTED_MSG = "We could not submit that. Please try again."
TOO_MANY_MSG = "Too many applications came from your network in the last hour. Please try again later."
TRAP_FIELD = "website"
RECENT_CODES_KEY = "registered_codes"
TICKET_CACHE_CONTROL = "private, max-age=300"


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
    if not event["published"] and not current_account():
        abort(404)
    return event


def form_page(event, values, errors, problem="", status=400):
    return render_template("event.html", event=event, values=values, errors=errors, problem=problem), status


@bp.get("/events/<slug>")
def event_page(slug):
    return form_page(event_or_404(slug), {}, {}, status=200)


def apply(event, data):
    state = "pending" if event["review_applications"] else "accepted"
    attendee = create_attendee(event["id"], state=state, **data)
    if state == "accepted":
        send_emails(event["id"], attendee_ids=[attendee["id"]])
    return attendee["attendee_code"]


@bp.post("/events/<slug>/register")
def register(slug):
    event = event_or_404(slug)
    if registration_state(event) != "open":
        abort(403, description="Registration for this event is not open.")

    data, errors = validate_registration(request.form)
    if request.form.get(TRAP_FIELD):
        return form_page(event, data, {}, NOT_SUBMITTED_MSG)
    if not errors and email_exists(event["id"], data["email"]):
        errors["email"] = DUPLICATE_MSG
    if errors:
        return form_page(event, data, errors)
    if not may_apply(request.remote_addr):
        return form_page(event, data, {}, TOO_MANY_MSG, 429)

    try:
        code = apply(event, data)
    except DuplicateEmailError:
        return form_page(event, data, {"email": DUPLICATE_MSG})
    session[RECENT_CODES_KEY] = (session.get(RECENT_CODES_KEY, []) + [code])[-5:]
    return redirect(url_for("main.registered", code=code))


@bp.get("/registered/<code>")
def registered(code):
    if code not in session.get(RECENT_CODES_KEY, []):
        abort(404)
    attendee = get_attendee_by_code(code)
    if attendee is None:
        abort(404)
    return render_template("registered.html", attendee=attendee)


@bp.get("/application/<token>")
def application(token):
    attendee = get_attendee_by_status_token(token)
    if attendee is None:
        abort(404)
    return render_template("registered.html", attendee=attendee)


@bp.get("/ticket/<token>.png")
def ticket(token):
    attendee = get_attendee_by_token(token)
    if attendee is None or attendee["state"] != "accepted":
        abort(404)
    code = attendee["attendee_code"]
    try:
        png = ticket_png(attendee)
    except Exception:
        current_app.logger.exception("QR generation failed for %s", code)
        abort(503, description="The ticket image is not available right now.")
    response = Response(png, mimetype="image/png")
    disposition = "attachment" if request.args.get("download") == "1" else "inline"
    response.headers.set("Content-Disposition", disposition, filename=f"{code}.png")
    response.headers["Cache-Control"] = TICKET_CACHE_CONTROL
    return response
