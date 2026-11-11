from flask import Blueprint, jsonify, render_template

bp = Blueprint("main", __name__)


@bp.get("/health")
def health():
    return jsonify(status="ok")


@bp.get("/")
def index():
    return render_template("index.html", values={}, errors={})
