from datetime import date

import pytest
from flask import abort

from app import create_app
from app.db import init_db
from app.services.events import create_event


def add_abort_routes(app):

    def fail(code):
        abort(code)

    def crash():
        raise ValueError("database password is hunter2")

    app.add_url_rule("/fail/<int:code>", view_func=fail)
    app.add_url_rule("/api/fail/<int:code>", endpoint="api_fail", view_func=fail)
    app.add_url_rule("/crash", view_func=crash)
    app.add_url_rule("/api/crash", endpoint="api_crash", view_func=crash)


@pytest.fixture
def failing_client(app):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    add_abort_routes(app)
    return app.test_client()


@pytest.mark.parametrize(
    ("code", "title"),
    [
        (400, "That did not go through"),
        (403, "This is closed to you"),
        (404, "We could not find that page"),
        (429, "Too many tries"),
        (500, "Something broke on our side"),
    ],
)
def test_error_pages_are_styled_and_link_home(failing_client, code, title):
    response = failing_client.get(f"/fail/{code}")
    html = response.get_data(as_text=True)
    assert response.status_code == code
    assert f"<h1>{title}</h1>" in html
    assert f"Error {code}" in html
    assert "css/style.css" in html
    assert '<a class="btn btn-primary" href="/">Back to home' in html


def test_unknown_page_shows_the_404_page(client):
    response = client.get("/no-such-page")
    assert response.status_code == 404
    assert "We could not find that page" in response.get_data(as_text=True)


def test_crash_shows_the_500_page_without_details(failing_client):
    response = failing_client.get("/crash")
    html = response.get_data(as_text=True)
    assert response.status_code == 500
    assert "Something broke on our side" in html
    assert "hunter2" not in html
    assert "ValueError" not in html


def test_other_error_codes_fall_back_to_the_standard_name(failing_client):
    response = failing_client.post("/health")
    assert response.status_code == 405
    assert "<h1>Method Not Allowed</h1>" in response.get_data(as_text=True)


def test_abort_description_is_shown_on_the_page(client, valid_form):
    with client.application.app_context():
        create_event("Later Talk", date(2026, 12, 20), "Hall B", date(2026, 12, 1))
    response = client.post("/events/later-talk/register", data=valid_form)
    assert response.status_code == 403
    assert "Registration for this event is not open." in response.get_data(as_text=True)


def test_expired_form_session_message_is_shown(tmp_path, valid_form):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "errors.db"),
        "QR_DIR": str(tmp_path / "qrcodes"),
        "MAIL_ENABLED": False,
    })
    with app.app_context():
        init_db()
    response = app.test_client().post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "Your form session expired. Please reload and try again." in response.get_data(as_text=True)


@pytest.mark.parametrize("code", [400, 403, 404, 429, 500])
def test_api_errors_are_json(failing_client, code):
    response = failing_client.get(f"/api/fail/{code}")
    body = response.get_json()
    assert response.status_code == code
    assert response.mimetype == "application/json"
    assert body["status"] == "error"
    assert body["code"] == code
    assert body["message"]


def test_unknown_api_path_is_a_json_404(client):
    response = client.get("/api/nothing-here")
    assert response.status_code == 404
    assert response.get_json() == {
        "status": "error",
        "code": 404,
        "message": "The link may be mistyped, or the page may have moved.",
    }


def test_api_crash_is_json_without_details(failing_client):
    response = failing_client.get("/api/crash")
    assert response.status_code == 500
    assert response.get_json()["message"] == "It is not your fault. Try again in a moment."
    assert "hunter2" not in response.get_data(as_text=True)
