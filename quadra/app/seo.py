from xml.sax.saxutils import escape

from flask import (
    Blueprint,
    Response,
    current_app,
    has_request_context,
    request,
    url_for,
)

from .services.events import list_upcoming

bp = Blueprint("seo", __name__)

SITE_DESCRIPTION = (
    "Register for seminars and events at the Polytechnic University of the Philippines"
    " and get your QR ticket by email."
)
SHARE_IMAGE_PATH = "/static/share.png"
PRIVATE_PATHS = (
    "/staff/",
    "/admin",
    "/scanner",
    "/checkin/",
    "/application/",
    "/registered/",
    "/ticket/",
    "/api/",
)


def site_url(path=""):
    return current_app.config["PUBLIC_BASE_URL"].rstrip("/") + path


@bp.app_context_processor
def inject_page_address():
    path = request.path if has_request_context() else ""
    return {
        "canonical_url": site_url(path),
        "site_description": SITE_DESCRIPTION,
        "share_image_url": site_url(SHARE_IMAGE_PATH),
    }


def public_paths():
    paths = [url_for("main.index")]
    paths += [url_for("main.event_page", slug=event["slug"]) for event in list_upcoming()]
    return paths


@bp.get("/sitemap.xml")
def sitemap():
    entries = "".join(f"<url><loc>{escape(site_url(path))}</loc></url>" for path in public_paths())
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>'
    )
    return Response(body, mimetype="application/xml")
