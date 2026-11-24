import itertools

import pytest

from app.db import get_db
from app.services.events import STATES_BY_PRECEDENCE, registration_state

PAST, FUTURE = "2026-10-05", "2026-11-30"
OPENED, OPENS_LATER = "2026-10-20", "2026-11-15"
EDITED = {
    "name": "Renamed Seminar",
    "venue": "Bulwagang Balagtas",
    "event_date": "2026-12-05",
    "opens_on": "2026-11-10",
}
EVERY_COMBINATION =list(itertools.product((PAST, FUTURE), (1, 0), (0, 1), (None, OPENED, OPENS_LATER)))


@pytest.fixture
def change_event(app):
    def change(slug="test-seminar", **columns):
        assignments = ", ".join(f"{column} = %s" for column in columns)
        with app.app_context():
            get_db().execute(f"UPDATE events SET {assignments} WHERE slug = %s", (*columns.values(), slug))
            get_db().commit()

    return change


@pytest.fixture
def registered(client, valid_form):
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 302
    return valid_form


def one(app, sql, params=()):
    with app.app_context():
        return get_db().execute(sql, params).fetchone()


def event_row(app, slug="test-seminar"):
    return one(app, "SELECT * FROM events WHERE slug = %s", (slug,))


def attendee_count(app):
    return one(app, "SELECT COUNT(*) AS total FROM attendees")["total"]


def expected_state(event_date, published, closed, opens_on):
    if event_date == PAST:
        return "ended"
    if not published:
        return "draft"
    if closed:
        return "closed"
    if opens_on == OPENS_LATER:
        return "soon"
    return "open"


def test_states_are_checked_in_the_documented_order():
    assert [state for state, _ in STATES_BY_PRECEDENCE] == ["ended", "draft", "closed", "soon", "open"]


@pytest.mark.parametrize("event_date, published, closed, opens_on", EVERY_COMBINATION)
def test_state_for_every_combination(app, event_date, published, closed, opens_on):
    event = {"event_date": event_date, "published": published, "registration_closed": closed, "opens_on": opens_on}
    with app.app_context():
        assert registration_state(event) == expected_state(event_date, published, closed, opens_on)


@pytest.mark.parametrize("event_date, published, closed, opens_on", EVERY_COMBINATION)
def test_only_open_events_take_registrations(
    app, client, change_event, valid_form, event_date, published, closed, opens_on
):
    change_event(event_date=event_date, published=published, registration_closed=closed, opens_on=opens_on)
    response = client.post("/events/test-seminar/register", data=valid_form)
    if expected_state(event_date, published, closed, opens_on) == "open":
        assert response.status_code == 302
        assert attendee_count(app) == 1
        return
    assert response.status_code == (403 if published else 404)
    assert attendee_count(app) == 0


@pytest.mark.parametrize("event_date", [PAST, FUTURE])
def test_public_cannot_see_a_draft(client, change_event, valid_form, event_date):
    change_event(published=0, event_date=event_date)
    assert "Test Seminar" not in client.get("/").get_data(as_text=True)
    assert client.get("/events/test-seminar").status_code == 404
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 404


def test_draft_is_never_the_featured_next_event(client, change_event):
    change_event(published=0)
    html = client.get("/").get_data(as_text=True)
    assert "next-card" not in html
    assert "No upcoming events yet." in html


def test_staff_can_preview_a_draft(staff_client, change_event):
    change_event(published=0)
    response = staff_client.get("/events/test-seminar")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "Draft. Only signed-in staff can see this page" in html
    assert "Not published yet" in html
    assert 'id="registration-form"' not in html


def test_staff_cannot_register_for_a_draft(app, staff_client, change_event, valid_form):
    change_event(published=0)
    assert staff_client.post("/events/test-seminar/register", data=valid_form).status_code == 403
    assert attendee_count(app) == 0


def test_published_event_has_no_draft_notice(staff_client):
    html = staff_client.get("/events/test-seminar").get_data(as_text=True)
    assert "Draft." not in html
    assert 'id="registration-form"' in html


def test_signed_out_staff_lose_the_draft_preview(staff_client, change_event):
    change_event(published=0)
    assert staff_client.get("/events/test-seminar").status_code == 200
    staff_client.post("/staff/logout")
    assert staff_client.get("/events/test-seminar").status_code == 404


def test_closed_event_still_shows_publicly_without_a_form(client, change_event):
    change_event(registration_closed=1)
    landing = client.get("/").get_data(as_text=True)
    assert "Test Seminar" in landing
    assert "Registration closed" in landing
    assert "next-card" not in landing
    page = client.get("/events/test-seminar")
    html = page.get_data(as_text=True)
    assert page.status_code == 200
    assert "Registration is closed" in html
    assert 'id="registration-form"' not in html


def test_closed_event_refuses_registration(app, client, change_event, valid_form):
    change_event(registration_closed=1)
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 403
    assert attendee_count(app) == 0


def test_reopened_event_follows_its_dates_again(client, change_event, valid_form):
    change_event(registration_closed=1, opens_on=OPENS_LATER)
    change_event(registration_closed=0)
    assert "Registration opens November 15, 2026" in client.get("/events/test-seminar").get_data(as_text=True)
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 403
    change_event(opens_on=None)
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 302


@pytest.mark.parametrize(
    "columns", [{"published": 0}, {"registration_closed": 1}, {"published": 0, "registration_closed": 1}]
)
def test_existing_tickets_survive_unpublishing_and_closing(
    app, client, staff_client, registered, change_event, columns
):
    token = one(app, "SELECT ticket_token FROM attendees")["ticket_token"]
    change_event(**columns)

    assert client.get(f"/ticket/{token}.png").status_code == 200
    dashboard = staff_client.get("/admin?event=test-seminar").get_data(as_text=True)
    assert registered["email"] in dashboard
    assert '<dd id="total-registered">1</dd>' in dashboard
    assert registered["email"] in staff_client.get("/admin/export.csv?event=test-seminar").get_data(as_text=True)

    assert staff_client.post("/api/checkin", json={"code": token}).get_json()["status"] == "checked_in"
    assert staff_client.get(f"/checkin/{token}").status_code == 200
    assert one(app, "SELECT checked_in FROM attendees")["checked_in"] == 1


def test_confirmation_page_still_works_after_unpublishing(client, registered, change_event):
    change_event(published=0)
    assert client.get("/registered/SEM-2026-0001").status_code == 200


def test_dashboard_selects_an_upcoming_draft_by_default(staff_client, change_event):
    change_event(published=0)
    html = staff_client.get("/admin").get_data(as_text=True)
    assert 'href="/admin?event=test-seminar"\n       aria-current="page"' in html


def test_edit_page_shows_the_current_details(staff_client):
    html = staff_client.get("/admin/events/test-seminar/edit").get_data(as_text=True)
    assert 'name="name" type="text" value="Test Seminar"' in html
    assert 'name="venue" type="text" value="Main Hall"' in html
    assert 'name="event_date" type="date" value="2026-11-30"' in html
    assert 'name="opens_on" type="date" value=""' in html


def test_staff_can_edit_an_event(app, staff_client):
    response = staff_client.post("/admin/events/test-seminar/edit", data=EDITED)
    assert response.status_code == 302
    assert response.headers["Location"] == "/admin?event=test-seminar"
    event = event_row(app)
    assert {key: event[key] for key in EDITED} == EDITED
    page = staff_client.get("/events/test-seminar").get_data(as_text=True)
    assert "Renamed Seminar" in page
    assert "Registration opens November 10, 2026" in page


def test_slug_stays_the_same_when_the_name_changes(app, client, staff_client):
    staff_client.post("/admin/events/test-seminar/edit", data=EDITED)
    assert event_row(app)["slug"] == "test-seminar"
    assert one(app, "SELECT COUNT(*) AS total FROM events")["total"] == 1
    assert client.get("/events/test-seminar").status_code == 200
    assert client.get("/events/renamed-seminar").status_code == 404


def test_opening_date_can_be_cleared(app, client, staff_client, change_event, valid_form):
    change_event(opens_on=OPENS_LATER)
    staff_client.post("/admin/events/test-seminar/edit", data={**EDITED, "opens_on": ""})
    assert event_row(app)["opens_on"] is None
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 302


def test_editing_keeps_visibility_and_registrations(app, staff_client, registered, change_event):
    change_event(published=0, registration_closed=1)
    staff_client.post("/admin/events/test-seminar/edit", data=EDITED)
    event = event_row(app)
    assert (event["published"], event["registration_closed"]) == (0, 1)
    assert attendee_count(app) == 1
    assert "Renamed Seminar" in staff_client.get("/admin/export.csv?event=test-seminar").get_data(as_text=True)


@pytest.mark.parametrize(
    "changes, message",
    [
        ({"name": ""}, "Event name is required."),
        ({"name": "x" * 121}, "Event name must be at most 120 characters."),
        ({"venue": ""}, "Venue is required."),
        ({"venue": "x" * 151}, "Venue must be at most 150 characters."),
        ({"event_date": ""}, "Pick the event date."),
        ({"opens_on": "someday"}, "Pick a valid opening date, or leave it empty."),
        ({"opens_on": "2026-12-06"}, "Registration must open on or before the event date."),
    ],
)
def test_editing_follows_the_rules_for_adding(app, staff_client, changes, message):
    before = event_row(app)
    response = staff_client.post("/admin/events/test-seminar/edit", data={**EDITED, **changes})
    assert response.status_code == 400
    assert message in response.get_data(as_text=True)
    assert event_row(app) == before


def test_failed_edit_keeps_what_was_typed(staff_client):
    response = staff_client.post("/admin/events/test-seminar/edit", data={**EDITED, "venue": ""})
    html = response.get_data(as_text=True)
    assert 'value="Renamed Seminar"' in html
    assert 'value="2026-12-05"' in html


def test_editing_records_who_and_when(app, staff, staff_client, freeze):
    assert event_row(app)["updated_at"] is None
    assert "<dd>Never</dd>" in staff_client.get("/admin/events/test-seminar/edit").get_data(as_text=True)
    freeze("2026-11-20T02:00:00")
    staff_client.post("/admin/events/test-seminar/edit", data=EDITED)
    event = event_row(app)
    assert (event["updated_by_id"], event["updated_at"]) == (staff["id"], "2026-11-20T02:00:00+00:00")
    assert event["created_by_id"] is None


def test_edit_page_shows_who_created_and_last_edited(staff_client, owner, sign_in, freeze):
    freeze("2026-11-20T02:00:00")
    staff_client.post("/admin/events", data={"name": "Talks", "venue": "Hall", "event_date": "2027-02-09"})
    freeze("2026-11-21T03:30:00")
    sign_in(owner).post("/admin/events/talks/edit", data={**EDITED, "event_date": "2027-02-10"})
    html = staff_client.get("/admin/events/talks/edit").get_data(as_text=True)
    assert "<dd>Nov 20, 2026 10:00 AM by Sam Staff</dd>" in html
    assert "<dd>Nov 21, 2026 11:30 AM by Olivia Owner</dd>" in html


def test_event_from_the_command_line_shows_no_creator(staff_client):
    html = staff_client.get("/admin/events/test-seminar/edit").get_data(as_text=True)
    assert "by someone not recorded</dd>" in html


def test_editing_an_unknown_event_is_a_404(staff_client):
    assert staff_client.get("/admin/events/nope/edit").status_code == 404
    assert staff_client.post("/admin/events/nope/edit", data=EDITED).status_code == 404


def test_dashboard_links_to_the_edit_page(staff_client):
    assert 'href="/admin/events/test-seminar/edit"' in staff_client.get("/admin").get_data(as_text=True)
