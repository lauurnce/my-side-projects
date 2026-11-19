from flask import g, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

PAGES = {
    400: ("That did not go through", "Something in the request was missing or out of date. Go back, reload the page and try again."),
    403: ("This is closed to you", "You do not have access to this page."),
    404: ("We could not find that page", "The link may be mistyped, or the page may have moved."),
    410: ("This link no longer works", "It has expired or was already used. Ask for a new one from the staff login page."),
    429: ("Too many tries", "Wait a minute, then try again."),
    500: ("Something broke on our side", "It is not your fault. Try again in a moment."),
    503: ("We will be right back", "The site is being updated. Try again in a few minutes."),
}


def has_custom_description(error):
    return error.description != type(error).description


def title_and_message(error):
    title, message = PAGES.get(error.code, (error.name, error.description))
    if has_custom_description(error):
        return title, error.description
    return title, message


def init_app(app):

    @app.errorhandler(HTTPException)
    def show_error(error):
        title, message = title_and_message(error)
        reference = g.get("error_reference")
        if request.path.startswith("/api/"):
            body = {"status": "error", "code": error.code, "message": message}
            return jsonify(body | ({"reference": reference} if reference else {})), error.code
        page = render_template("error.html", code=error.code, title=title, message=message, reference=reference)
        return page, error.code
