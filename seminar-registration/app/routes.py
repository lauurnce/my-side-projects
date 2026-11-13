import os

from flask import (
    Blueprint,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)

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

DUPLICATE_MSG = "This email is already registered. Check your inbox for your ticket."


@bp.get("/health")
def health():
    return jsonify(status="ok")


@bp.get("/")
def index():
    return render_template("index.html", values={}, errors={})


@bp.post("/register")
def register():
    data, errors = validate_registration(request.form)
    if not errors and email_exists(data["email"]):
        errors["email"] = DUPLICATE_MSG

    if not errors:
        try:
            attendee = create_attendee(**data)
        except DuplicateEmailError:
            errors["email"] = DUPLICATE_MSG
        else:
            return redirect(url_for("main.registered", code=attendee["attendee_code"]))

    return render_template("index.html", values=data, errors=errors), 400


@bp.get("/registered/<code>")
def registered(code):
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
