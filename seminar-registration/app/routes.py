from flask import Blueprint, abort, jsonify, redirect, render_template, request, url_for

from .services.registration import (
    DuplicateEmailError,
    create_attendee,
    email_exists,
    get_attendee_by_code,
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
