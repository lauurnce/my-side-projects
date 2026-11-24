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
NEW_EVENT = {"name": "Talks", "venue": "Hall", "event_date": "2027-02-09"}
EVERY_COMBINATION = list(itertools.product((PAST, FUTURE), (1, 0), (0, 1), (None, OPENED, OPENS_LATER)))


@pytest.fixture
def change_event(app):
    def change(slug="test-seminar", **columns):
        if not columns:
            return
        assignments = ", ".join(f"{column} = %s" for column in columns)
        with app.app_context():
            get_db().execute(f"UPDATE events SET {assignments} WHERE slug = %s", (*columns.values(), slug))
            get_db().commit()

    return change


@pytest.fixture
def visitor(app):
    return app.test_client()


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


def test_slug_stays_the_same_when_the_name_changes(app, visitor, staff_client):
    staff_client.post("/admin/events/test-seminar/edit", data=EDITED)
    assert event_row(app)["slug"] == "test-seminar"
    assert one(app, "SELECT COUNT(*) AS total FROM events")["total"] == 1
    assert visitor.get("/events/test-seminar").status_code == 200
    assert visitor.get("/events/renamed-seminar").status_code == 404


def test_opening_date_can_be_cleared(app, visitor, staff_client, change_event, valid_form):
    change_event(opens_on=OPENS_LATER)
    staff_client.post("/admin/events/test-seminar/edit", data={**EDITED, "opens_on": ""})
    assert event_row(app)["opens_on"] is None
    assert visitor.post("/events/test-seminar/register", data=valid_form).status_code == 302


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


def test_new_event_is_published_unless_saved_as_a_draft(app, visitor, staff_client):
    staff_client.post("/admin/events", data={**NEW_EVENT, "name": "Public Talks"})
    staff_client.post("/admin/events", data={**NEW_EVENT, "name": "Quiet Talks", "visibility": "draft"})
    assert event_row(app, "public-talks")["published"] == 1
    assert event_row(app, "quiet-talks")["published"] == 0
    landing = visitor.get("/").get_data(as_text=True)
    assert "Public Talks" in landing
    assert "Quiet Talks" not in landing
    assert visitor.get("/events/quiet-talks").status_code == 404


def test_saving_a_draft_says_so(staff_client):
    response = staff_client.post("/admin/events", data={**NEW_EVENT, "visibility": "draft"}, follow_redirects=True)
    assert "Talks was saved as a draft." in response.get_data(as_text=True)


def test_staff_can_publish_and_unpublish(app, visitor, staff_client):
    response = staff_client.post("/admin/events/test-seminar/unpublish")
    assert response.status_code == 302
    assert response.headers["Location"] == "/admin?event=test-seminar"
    assert event_row(app)["published"] == 0
    assert visitor.get("/events/test-seminar").status_code == 404

    staff_client.post("/admin/events/test-seminar/publish")
    assert event_row(app)["published"] == 1
    assert visitor.get("/events/test-seminar").status_code == 200
    assert "Test Seminar" in visitor.get("/").get_data(as_text=True)


def test_staff_can_close_and_reopen_registration(app, visitor, staff_client, valid_form):
    staff_client.post("/admin/events/test-seminar/close")
    assert event_row(app)["registration_closed"] == 1
    assert visitor.post("/events/test-seminar/register", data=valid_form).status_code == 403

    staff_client.post("/admin/events/test-seminar/reopen")
    assert event_row(app)["registration_closed"] == 0
    assert visitor.post("/events/test-seminar/register", data=valid_form).status_code == 302


def test_closing_does_not_change_the_opening_date(app, staff_client, change_event):
    change_event(opens_on=OPENS_LATER)
    staff_client.post("/admin/events/test-seminar/close")
    staff_client.post("/admin/events/test-seminar/reopen")
    assert event_row(app)["opens_on"] == OPENS_LATER


@pytest.mark.parametrize("switch", ["publish", "unpublish", "close", "reopen"])
def test_switching_records_who_did_it(app, staff, staff_client, switch):
    staff_client.post(f"/admin/events/test-seminar/{switch}")
    assert event_row(app)["updated_by_id"] == staff["id"]


def test_tickets_issued_before_unpublishing_and_closing_still_scan(app, staff_client, registered):
    token = one(app, "SELECT ticket_token FROM attendees")["ticket_token"]
    staff_client.post("/admin/events/test-seminar/unpublish")
    staff_client.post("/admin/events/test-seminar/close")
    assert staff_client.post("/api/checkin", json={"code": token}).get_json()["status"] == "checked_in"
    dashboard = staff_client.get("/admin?event=test-seminar").get_data(as_text=True)
    assert '<dd id="total-checked-in">1</dd>' in dashboard


def test_unknown_switch_or_event_is_a_404(staff_client):
    assert staff_client.post("/admin/events/test-seminar/archive").status_code == 404
    assert staff_client.post("/admin/events/nope/publish").status_code == 404


def test_switches_only_answer_to_post(app, staff_client):
    assert staff_client.get("/admin/events/test-seminar/unpublish").status_code == 405
    assert event_row(app)["published"] == 1


@pytest.mark.parametrize(
    "columns, offered, missing",
    [
        ({}, ["/unpublish", "/close"], ["/publish", "/reopen"]),
        ({"published": 0}, ["/publish", "/close"], ["/unpublish", "/reopen"]),
        ({"registration_closed": 1}, ["/unpublish", "/reopen"], ["/publish", "/close"]),
    ],
)
def test_dashboard_offers_the_switches_that_apply(staff_client, change_event, columns, offered, missing):
    change_event(**columns)
    html = staff_client.get("/admin?event=test-seminar").get_data(as_text=True)
    for path in offered:
        assert f'action="/admin/events/test-seminar{path}"' in html
    for path in missing:
        assert f'action="/admin/events/test-seminar{path}"' not in html


@pytest.mark.parametrize(
    "columns, label",
    [
        ({}, "Registration open</span>"),
        ({"registration_closed": 1}, "Registration closed</span>"),
        ({"published": 0}, "Draft</span>"),
        ({"opens_on": OPENS_LATER}, "Opens later &middot; Nov 15</span>"),
        ({"event_date": PAST}, "Ended</span>"),
    ],
)
def test_dashboard_shows_the_state_of_the_selected_event(staff_client, change_event, columns, label):
    change_event(**columns)
    assert label in staff_client.get("/admin?event=test-seminar").get_data(as_text=True)


def test_dashboard_shows_that_an_ended_event_is_also_a_draft(staff_client, change_event):
    change_event(event_date=PAST, published=0)
    html = staff_client.get("/admin?event=test-seminar").get_data(as_text=True)
    assert "Ended</span>" in html
    assert '<span class="pill pill-wait">Draft</span>' in html


def test_switcher_labels_draft_and_past_events(app, staff_client, change_event):
    staff_client.post("/admin/events", data={**NEW_EVENT, "name": "Quiet Talks", "visibility": "draft"})
    staff_client.post("/admin/events", data={**NEW_EVENT, "name": "Old Talks", "event_date": PAST})
    html = staff_client.get("/admin").get_data(as_text=True)
    assert ">Test Seminar</a>" in html
    assert ">Quiet Talks &middot; Draft</a>" in html
    assert ">Old Talks &middot; Past</a>" in html
