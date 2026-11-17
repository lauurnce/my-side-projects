from flask import Blueprint, current_app, has_request_context, request

bp = Blueprint("seo", __name__)

SITE_DESCRIPTION = (
    "Register for seminars and events at the Polytechnic University of the Philippines"
    " and get your QR ticket by email."
)
SHARE_IMAGE_PATH = "/static/share.png"


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
