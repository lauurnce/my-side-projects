from datetime import date

import pytest

from app.db import get_db
from app.services.events import create_event, parse_date, slugify

PIN = "4321"


@pytest.fixture
def more_events(app):
    with app.app_context():
        create_event("Research Colloquium 2027", date(2027, 1, 18), "Bulwagang Balagtas", date(2026, 12, 15))
        create_event("Orientation 2026", date(2026, 10, 5), "Gymnasium")


@pytest.fixture
def staff_client(app, client):
    app.config["STAFF_PIN"] = PIN
    assert client.post("/staff/login", data={"pin": PIN}).status_code == 302
    return client


def attendee_count(app):
    with app.app_context():
        return get_db().execute("SELECT COUNT(*) AS total FROM attendees").fetchone()["total"]


def test_init_db_creates_the_event_from_config(app):
    with app.app_context():
        event = get_db().execute("SELECT * FROM events").fetchone()
    assert event["slug"] == "test-seminar"
    assert event["name"] == "Test Seminar"
    assert event["event_date"] == "2026-11-30"
    assert event["venue"] == "Main Hall"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("2026-11-30", date(2026, 11, 30)),
        ("November 30, 2026", date(2026, 11, 30)),
        ("Nov 30, 2026", date(2026, 11, 30)),
        ("TBA", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_date(text, expected):
    assert parse_date(text) == expected


@pytest.mark.parametrize(
    "name, expected",
    [("Tech Innovators Seminar 2026", "tech-innovators-seminar-2026"), ("  R&D: Day 1! ", "r-d-day-1"), ("!!!", "event")],
)
def test_slugify(name, expected):
    assert slugify(name) == expected


def test_events_with_the_same_name_get_different_slugs(app):
    with app.app_context():
        second = create_event("Test Seminar", date(2027, 3, 1), "Main Hall")
        third = create_event("Test Seminar", date(2027, 4, 1), "Main Hall")
    assert second["slug"] == "test-seminar-2"
    assert third["slug"] == "test-seminar-3"


def test_landing_lists_upcoming_events_soonest_first(client, more_events):
    html = client.get("/").get_data(as_text=True)
    assert html.index("Test Seminar") < html.index("Research Colloquium 2027")
    assert "Main Hall" in html
    assert "Opens Dec 15" in html
    assert "Orientation 2026" not in html


def test_landing_features_the_next_open_event(client, more_events):
    html = client.get("/").get_data(as_text=True)
    assert 'class="next-card glass" href="/events/test-seminar"' in html
    assert "Next event &middot; Nov 30" in html


def test_landing_with_no_events(app, client):
    with app.app_context():
        get_db().execute("DELETE FROM events")
        get_db().commit()
    html = client.get("/").get_data(as_text=True)
    assert "No upcoming events yet." in html
    assert "next-card" not in html


def test_unknown_event_is_a_404(client, valid_form):
    assert client.get("/events/nope").status_code == 404
    assert client.post("/events/nope/register", data=valid_form).status_code == 404


def test_event_that_opens_later_shows_no_form(client, more_events):
    html = client.get("/events/research-colloquium-2027").get_data(as_text=True)
    assert "Registration opens December 15, 2026" in html
    assert 'id="registration-form"' not in html


def test_ended_event_shows_no_form(client, more_events):
    html = client.get("/events/orientation-2026").get_data(as_text=True)
    assert "This event has ended" in html
    assert 'id="registration-form"' not in html


@pytest.mark.parametrize("slug", ["research-colloquium-2027", "orientation-2026"])
def test_registering_for_a_closed_event_is_refused(app, client, more_events, valid_form, slug):
    assert client.post(f"/events/{slug}/register", data=valid_form).status_code == 403
    assert attendee_count(app) == 0


def test_same_email_can_register_for_two_events(app, client, valid_form):
    with app.app_context():
        create_event("Career Launch Talks", date(2027, 2, 9), "Main Campus")
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 302
    assert client.post("/events/career-launch-talks/register", data=valid_form).status_code == 302
    assert client.post("/events/career-launch-talks/register", data=valid_form).status_code == 400
    assert attendee_count(app) == 2


def test_ticket_page_and_email_use_the_attendees_event(app, client, valid_form):
    with app.app_context():
        create_event("Career Launch Talks", date(2027, 2, 9), "Main Campus")
    response = client.post("/events/career-launch-talks/register", data=valid_form, follow_redirects=True)
    html = response.get_data(as_text=True)
    assert "Career Launch Talks" in html
    assert "February 9, 2027" in html
    assert "Main Campus" in html
    assert "Test Seminar" not in html


def test_my_ticket_link_appears_after_registering(client, valid_form):
    assert "My ticket" not in client.get("/").get_data(as_text=True)
    client.post("/events/test-seminar/register", data=valid_form)
    assert 'href="/registered/SEM-2026-0001"' in client.get("/").get_data(as_text=True)


def test_admin_shows_one_event_at_a_time(app, staff_client, valid_form):
    with app.app_context():
        create_event("Career Launch Talks", date(2027, 2, 9), "Main Campus")
    staff_client.post("/events/test-seminar/register", data=valid_form)

    first = staff_client.get("/admin?event=test-seminar").get_data(as_text=True)
    assert '<dd id="total-registered">1</dd>' in first
    assert "juan@example.com" in first

    second = staff_client.get("/admin?event=career-launch-talks").get_data(as_text=True)
    assert '<dd id="total-registered">0</dd>' in second
    assert "juan@example.com" not in second


def test_admin_defaults_to_the_next_upcoming_event(staff_client, more_events):
    html = staff_client.get("/admin").get_data(as_text=True)
    assert 'href="/admin?event=test-seminar"\n       aria-current="page"' in html


def test_admin_unknown_event_is_a_404(staff_client):
    assert staff_client.get("/admin?event=nope").status_code == 404
    assert staff_client.get("/admin/export.csv?event=nope").status_code == 404


def test_csv_export_only_has_the_selected_event(app, staff_client, valid_form):
    with app.app_context():
        create_event("Career Launch Talks", date(2027, 2, 9), "Main Campus")
    staff_client.post("/events/test-seminar/register", data=valid_form)
    body = staff_client.get("/admin/export.csv?event=career-launch-talks").get_data(as_text=True)
    assert "juan@example.com" not in body


def test_staff_can_add_an_event(app, staff_client):
    response = staff_client.post(
        "/admin/events",
        data={"name": "Career Launch Talks", "venue": "Main Campus", "event_date": "2027-02-09", "opens_on": ""},
    )
    assert response.status_code == 302
    assert response.headers["Location"] == "/admin?event=career-launch-talks"
    assert "Career Launch Talks" in staff_client.get("/").get_data(as_text=True)


@pytest.mark.parametrize(
    "form, message",
    [
        ({"name": "", "venue": "Hall", "event_date": "2027-02-09"}, "Event name is required."),
        ({"name": "Talks", "venue": "", "event_date": "2027-02-09"}, "Venue is required."),
        ({"name": "Talks", "venue": "Hall", "event_date": ""}, "Pick the event date."),
        (
            {"name": "Talks", "venue": "Hall", "event_date": "2027-02-09", "opens_on": "2027-03-01"},
            "Registration must open on or before the event date.",
        ),
    ],
)
def test_adding_an_event_reports_what_is_wrong(app, staff_client, form, message):
    response = staff_client.post("/admin/events", data=form)
    assert response.status_code == 400
    assert message in response.get_data(as_text=True)
    with app.app_context():
        assert get_db().execute("SELECT COUNT(*) AS total FROM events").fetchone()["total"] == 1


def test_adding_an_event_requires_staff(app, client):
    app.config["STAFF_PIN"] = PIN
    response = client.post("/admin/events", data={"name": "Talks", "venue": "Hall", "event_date": "2027-02-09"})
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/staff/login")


def test_add_event_command(app):
    result = app.test_cli_runner().invoke(
        args=["add-event", "--name", "Career Launch Talks", "--date", "2027-02-09", "--venue", "Main Campus"]
    )
    assert result.exit_code == 0
    assert "Added Career Launch Talks at /events/career-launch-talks" in result.output


def test_add_event_command_rejects_a_bad_date(app):
    result = app.test_cli_runner().invoke(
        args=["add-event", "--name", "Talks", "--date", "someday", "--venue", "Hall"]
    )
    assert result.exit_code != 0
    assert "Dates must look like 2026-11-30." in result.output
