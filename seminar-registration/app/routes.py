from flask import Blueprint, abort, jsonify, render_template

from .services.registration import get_attendee_by_code

bp = Blueprint("main", __name__)


@bp.get("/health")
def health():
    return jsonify(status="ok")


@bp.get("/")
def index():
    return render_template("index.html", values={}, errors={})


@bp.get("/registered/<code>")
def registered(code):
    attendee = get_attendee_by_code(code)
    if attendee is None:
        abort(404)
    return render_template("registered.html", attendee=attendee)
