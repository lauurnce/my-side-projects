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
    if current_app.config["STAGING"]:
        return []
    paths = [url_for("main.index"), url_for("main.privacy")]
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


@bp.get("/robots.txt")
def robots():
    if current_app.config["STAGING"]:
        return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")
    lines = ["User-agent: *", "Allow: /"]
    lines += [f"Disallow: {path}" for path in PRIVATE_PATHS]
    lines.append(f"Sitemap: {site_url(url_for('seo.sitemap'))}")
    return Response("\n".join(lines) + "\n", mimetype="text/plain")


def is_private(path):
    return path.startswith(PRIVATE_PATHS)


@bp.after_app_request
def keep_private_pages_out_of_search(response):
    if is_private(request.path) or response.status_code >= 400:
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


def event_structured_data(event):
    return {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": event["name"],
        "startDate": event["event_date"],
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "location": {"@type": "Place", "name": event["venue"], "address": event["venue"]},
        "url": site_url(url_for("main.event_page", slug=event["slug"])),
        "image": site_url(SHARE_IMAGE_PATH),
    }


def init_app(app):
    app.jinja_env.globals["event_structured_data"] = event_structured_data
    app.register_blueprint(bp)
