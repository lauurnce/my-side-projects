import pytest

from app.db import get_db
from app.services import registration


def fetch_all(app):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()


def test_event_page_shows_event_details_and_form(client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert "Test Seminar" in html
    assert "November 30, 2026" in html
    assert "Main Hall" in html
    for name in ("full_name", "email", "organization", "contact_number"):
        assert f'name="{name}"' in html


def test_valid_submission_saves_row(client, app, valid_form):
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 302
    assert response.headers["Location"].endswith("/registered/SEM-2026-0001")

    rows = fetch_all(app)
    assert len(rows) == 1
    row = rows[0]
    assert row["full_name"] == "Juan Dela Cruz"
    assert row["email"] == "juan@example.com"
    assert row["organization"] == "PUP"
    assert row["contact_number"] == "+639171234567"
    assert row["email_status"] == "pending"
    assert row["checked_in"] == 0
    assert row["created_at"]


def test_confirmation_page_shows_summary(client, valid_form):
    response = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True)
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "SEM-2026-0001" in html
    assert "Juan Dela Cruz" in html
    assert "+639171234567" in html


def test_confirmation_page_shows_the_registration_time_in_manila(client, app, valid_form, monkeypatch):
    monkeypatch.setattr(registration, "utc_timestamp", lambda *_offset: "2026-11-01T17:30:00+00:00")
    response = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True)
    assert "<dd>Nov 2, 2026 1:30 AM</dd>" in response.get_data(as_text=True)
    assert fetch_all(app)[0]["created_at"] == "2026-11-01T17:30:00+00:00"


def test_unknown_attendee_code_is_404(client):
    assert client.get("/registered/SEM-2026-9999").status_code == 404


@pytest.mark.parametrize("missing", ["full_name", "email", "organization", "contact_number"])
def test_missing_required_field_is_rejected(client, app, valid_form, missing):
    valid_form[missing] = "   "
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "is required." in response.get_data(as_text=True)
    assert fetch_all(app) == []


@pytest.mark.parametrize("email", ["juan", "juan@", "juan@example", "ju an@example.com"])
def test_bad_email_is_rejected(client, app, valid_form, email):
    valid_form["email"] = email
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "Enter a valid email address" in response.get_data(as_text=True)
    assert fetch_all(app) == []


@pytest.mark.parametrize("phone", ["12345", "0917123456", "091712345678", "08171234567", "+63817123456", "abcdefghijk"])
def test_bad_phone_is_rejected(client, app, valid_form, phone):
    valid_form["contact_number"] = phone
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "Enter a PH mobile number" in response.get_data(as_text=True)
    assert fetch_all(app) == []


@pytest.mark.parametrize("phone", ["09171234567", "+639171234567", " 0917 123 4567 ", "0917-123-4567"])
def test_phone_is_normalized(client, app, valid_form, phone):
    valid_form["contact_number"] = phone
    client.post("/events/test-seminar/register", data=valid_form)
    assert fetch_all(app)[0]["contact_number"] == "+639171234567"


def test_fields_are_trimmed_and_email_lowercased(client, app, valid_form):
    valid_form.update(full_name="  Juan   Dela Cruz ", email="  Juan@Example.COM ", organization=" PUP ")
    client.post("/events/test-seminar/register", data=valid_form)
    row = fetch_all(app)[0]
    assert row["full_name"] == "Juan Dela Cruz"
    assert row["email"] == "juan@example.com"
    assert row["organization"] == "PUP"


def test_too_long_name_is_rejected(client, app, valid_form):
    valid_form["full_name"] = "A" * 101
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "at most 100 characters" in response.get_data(as_text=True)


def test_duplicate_email_is_rejected(client, app, valid_form):
    client.post("/events/test-seminar/register", data=valid_form)
    valid_form.update(full_name="Someone Else", email="JUAN@example.com")
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "already registered" in response.get_data(as_text=True)
    assert len(fetch_all(app)) == 1


def test_duplicate_that_slips_past_the_form_check_is_refused(app, valid_form):
    details = {**valid_form, "contact_number": "+639171234567"}
    with app.app_context():
        event_id = get_db().execute("SELECT id FROM events").fetchone()["id"]
        first = registration.create_attendee(event_id, **details)
        with pytest.raises(registration.DuplicateEmailError):
            registration.create_attendee(event_id, **{**details, "email": "JUAN@example.com"})
        second = registration.create_attendee(event_id, **{**details, "email": "maria@example.com"})
    assert first["attendee_code"] == "SEM-2026-0001"
    assert second["email"] == "maria@example.com"
    assert len(fetch_all(app)) == 2


def test_nul_characters_in_the_form_do_not_break_registration(client, app, valid_form):
    valid_form["organization"] = "PU\x00P"
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 302
    assert fetch_all(app)[0]["organization"] == "PUP"
    assert client.get("/events/test\x00-seminar").status_code == 200


def test_typed_values_are_kept_on_error(client, valid_form):
    valid_form["contact_number"] = "123"
    html = client.post("/events/test-seminar/register", data=valid_form).get_data(as_text=True)
    assert 'value="Juan Dela Cruz"' in html
    assert 'value="juan@example.com"' in html
    assert 'value="PUP"' in html
    assert 'value="123"' in html


def test_attendee_code_increments(client, app, valid_form):
    for i in range(3):
        valid_form["email"] = f"person{i}@example.com"
        client.post("/events/test-seminar/register", data=valid_form)
    codes = [row["attendee_code"] for row in fetch_all(app)]
    assert codes == ["SEM-2026-0001", "SEM-2026-0002", "SEM-2026-0003"]


def test_ticket_token_is_unique(client, app, valid_form):
    for i in range(5):
        valid_form["email"] = f"person{i}@example.com"
        client.post("/events/test-seminar/register", data=valid_form)
    tokens = [row["ticket_token"] for row in fetch_all(app)]
    assert len(set(tokens)) == 5
    assert all(len(token) >= 32 for token in tokens)


def test_post_without_csrf_token_is_rejected(make_app, valid_form):
    app = make_app({"MAIL_ENABLED": False})
    response = app.test_client().post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert fetch_all(app) == []


def test_post_with_csrf_token_is_accepted(make_app, valid_form):
    app = make_app({
        "MAIL_ENABLED": False,
        "EVENT_NAME": "Test Seminar",
        "EVENT_DATE": "November 30, 2026",
        "EVENT_VENUE": "Main Hall",
        "TODAY": "2026-11-01",
    })
    client = app.test_client()
    client.get("/events/test-seminar")
    with client.session_transaction() as session:
        token = session["_csrf_token"]
    response = client.post("/events/test-seminar/register", data={**valid_form, "csrf_token": token})
    assert response.status_code == 302


def attempts(app):
    with app.app_context():
        return get_db().execute("SELECT * FROM application_attempts ORDER BY address").fetchall()


def other_person(number):
    return {
        "full_name": f"Person {number}",
        "email": f"person{number}@example.com",
        "organization": "PUP",
        "contact_number": "09171234567",
    }


def apply_from(client, number, address="203.0.113.7"):
    return client.post(
        "/events/test-seminar/register", data=other_person(number), environ_overrides={"REMOTE_ADDR": address}
    )


@pytest.fixture
def two_per_hour(monkeypatch):
    monkeypatch.setattr(registration, "MAX_APPLICATIONS_PER_ADDRESS", 2)


def test_form_has_a_trap_field_hidden_by_a_class(client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert '<div class="visually-hidden" aria-hidden="true">' in html
    assert '<input id="website" name="website" type="text" tabindex="-1" autocomplete="off">' in html
    assert "style=" not in html


@pytest.mark.parametrize("review", [True, False])
def test_filled_trap_field_creates_nothing(app, client, valid_form, review, caplog):
    with app.app_context():
        get_db().execute("UPDATE events SET review_applications = %s", (int(review),))
        get_db().commit()
    with caplog.at_level("INFO"):
        response = client.post("/events/test-seminar/register", data={**valid_form, "website": "http://spam.example"})
    assert response.status_code == 400
    assert "We could not submit that. Please try again." in response.get_data(as_text=True)
    assert "spam.example" not in response.get_data(as_text=True)
    assert fetch_all(app) == []
    assert attempts(app) == []
    assert "juan@example.com" not in caplog.text
    assert client.get("/registered/SEM-2026-0001").status_code == 404


def test_an_empty_trap_field_lets_the_application_through(app, client, valid_form):
    assert client.post("/events/test-seminar/register", data={**valid_form, "website": ""}).status_code == 302
    assert len(fetch_all(app)) == 1


def test_applications_per_address_are_limited(app, client, two_per_hour):
    assert apply_from(client, 1).status_code == 302
    assert apply_from(client, 2).status_code == 302
    response = apply_from(client, 3)
    assert response.status_code == 429
    assert "Too many applications came from your network" in response.get_data(as_text=True)
    assert 'value="person3@example.com"' in response.get_data(as_text=True)
    assert [attendee["email"] for attendee in fetch_all(app)] == ["person1@example.com", "person2@example.com"]


def test_the_limit_is_kept_in_the_database_and_shared_by_every_client(app, two_per_hour):
    assert apply_from(app.test_client(), 1).status_code == 302
    assert apply_from(app.test_client(), 2).status_code == 302
    assert apply_from(app.test_client(), 3).status_code == 429
    assert [(attempt["address"], attempt["applications"]) for attempt in attempts(app)] == [("203.0.113.7", 3)]


def test_the_limit_is_per_address(app, client, two_per_hour):
    apply_from(client, 1)
    apply_from(client, 2)
    assert apply_from(client, 3, "198.51.100.9").status_code == 302
    assert apply_from(client, 4).status_code == 429


def test_the_limit_uses_the_login_address_normalisation(app, client, two_per_hour):
    apply_from(client, 1, "2001:db8:1:2::1")
    apply_from(client, 2, "2001:db8:1:2:ffff::9")
    assert apply_from(client, 3, "2001:db8:1:2::abcd").status_code == 429
    assert apply_from(client, 4, "::ffff:203.0.113.7").status_code == 302
    assert [attempt["address"] for attempt in attempts(app)] == ["2001:db8:1:2::/64", "203.0.113.7"]


def test_the_limit_lifts_after_an_hour(app, client, two_per_hour, pass_time):
    apply_from(client, 1)
    apply_from(client, 2)
    pass_time(minutes=59)
    assert apply_from(client, 3).status_code == 429
    pass_time(minutes=2)
    assert apply_from(client, 3).status_code == 302
    assert [attempt["applications"] for attempt in attempts(app)] == [1]


def test_invalid_and_duplicate_submissions_do_not_count_toward_the_limit(app, client, two_per_hour):
    apply_from(client, 1)
    for _ in range(3):
        assert apply_from(client, 1).status_code == 400
        bad = client.post(
            "/events/test-seminar/register", data={"email": "nope"}, environ_overrides={"REMOTE_ADDR": "203.0.113.7"}
        )
        assert bad.status_code == 400
    assert apply_from(client, 2).status_code == 302


def test_the_real_limit_is_thirty_an_hour():
    assert registration.MAX_APPLICATIONS_PER_ADDRESS == 30
    assert registration.APPLICATION_WINDOW.total_seconds() == 3600
