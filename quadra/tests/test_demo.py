from collections import Counter

import psycopg
import pytest

from app.db import get_db
from app.demo import REVIEWER_EMAIL
from app.services.events import list_events, registration_state

SETTINGS = {
    "PUBLIC_BASE_URL": "http://localhost:5000",
    "CSRF_ENABLED": False,
    "MAIL_ENABLED": False,
    "TODAY": "2026-11-01",
    "EVENT_DATE": "TBA",
    "SECRET_KEY": "a-long-random-staging-key",
}


@pytest.fixture
def app(make_app):
    return make_app({**SETTINGS, "STAGING": True})


def run(app, *args):
    return app.test_cli_runner().invoke(args=["demo-data", *args])


def query(app, sql):
    with app.app_context():
        return get_db().execute(sql).fetchall()


def count(app, table):
    return query(app, f"SELECT COUNT(*) AS total FROM {table}")[0]["total"]


def add_one_event(app):
    result = app.test_cli_runner().invoke(
        args=["add-event", "--name", "Real Seminar", "--date", "2026-12-01", "--venue", "Main Hall"]
    )
    assert result.exit_code == 0


@pytest.fixture
def filled(app):
    result = run(app)
    assert result.exit_code == 0, result.output
    return app


def test_demo_data_adds_an_event_in_every_state(filled):
    with filled.app_context():
        states = Counter(registration_state(event) for event in list_events())
    assert states == {"open": 2, "draft": 1, "closed": 1, "soon": 1, "ended": 1}


def test_demo_data_has_one_review_and_one_automatic_open_event(filled):
    with filled.app_context():
        modes = {event["review_applications"] for event in list_events() if registration_state(event) == "open"}
    assert modes == {0, 1}


def test_demo_data_has_applicants_in_every_application_state(filled):
    states = Counter(row["state"] for row in query(filled, "SELECT state FROM attendees"))
    assert set(states) == {"pending", "accepted", "declined"}
    assert sum(states.values()) == 23


def test_demo_data_covers_every_email_state_staff_can_act_on(filled):
    statuses = {row["email_status"] for row in query(filled, "SELECT email_status FROM attendees")}
    assert statuses == {"none", "pending", "sent", "failed"}


def test_demo_data_checks_some_people_in_on_the_ended_event(filled):
    checked_in = query(
        filled,
        "SELECT e.name FROM attendees a JOIN events e ON e.id = a.event_id WHERE a.checked_in = 1",
    )
    assert [row["name"] for row in checked_in] == ["Alumni Homecoming Forum (demo)"] * 3


def test_demo_data_is_clearly_fake(filled):
    people = query(filled, "SELECT full_name, email FROM attendees")
    assert all(person["email"].endswith("@example.test") for person in people)
    assert all(person["full_name"].endswith("(demo)") for person in people)
    assert all(row["name"].endswith("(demo)") for row in query(filled, "SELECT name FROM events"))


def test_demo_data_gives_every_applicant_a_consent_time_and_a_code(filled):
    people = query(filled, "SELECT attendee_code, consented_at FROM attendees")
    assert all(person["consented_at"] for person in people)
    assert all(person["attendee_code"].startswith("SEM-2026-") for person in people)


def test_demo_reviewer_cannot_sign_in(filled):
    reviewer = query(filled, "SELECT * FROM accounts")
    assert [(row["email"], row["active"], row["password_hash"]) for row in reviewer] == [(REVIEWER_EMAIL, 0, None)]
    assert count(filled, "account_tokens") == 0


def test_demo_data_never_sends_email(app, fake_smtp, caplog):
    with caplog.at_level("INFO"):
        assert run(app).exit_code == 0
    assert fake_smtp.instances == []
    assert "example.test" not in caplog.text


def test_demo_data_shows_up_on_the_site(filled, client, staff_client):
    landing = client.get("/").get_data(as_text=True)
    assert "Campus Tech Summit (demo)" in landing
    assert "Research Colloquium (demo)" not in landing
    dashboard = staff_client.get("/admin?event=campus-tech-summit-demo").get_data(as_text=True)
    assert '<span id="count-pending">5</span>' in dashboard
    assert "Althea Ramos (demo)" in dashboard
    assert "Demo Reviewer" in dashboard


def test_demo_data_says_what_it_added(app):
    output = run(app).output
    assert "Added Campus Tech Summit (demo) at /events/campus-tech-summit-demo" in output
    assert "Added 23 applicants with @example.test addresses. No email was sent." in output


def test_demo_data_refuses_a_database_that_already_has_events(app):
    add_one_event(app)
    result = run(app)
    assert result.exit_code != 0
    assert "already has events" in result.output
    assert count(app, "events") == 1
    assert count(app, "attendees") == 0


def test_demo_data_twice_needs_force(filled):
    assert run(filled).exit_code != 0
    assert count(filled, "events") == 6


def test_forced_demo_data_adds_next_to_existing_events(app):
    add_one_event(app)
    result = run(app, "--force")
    assert result.exit_code == 0, result.output
    assert count(app, "events") == 7
    assert query(app, "SELECT name FROM events WHERE id = 1")[0]["name"] == "Real Seminar"


def test_forced_demo_data_can_run_twice(filled):
    assert run(filled, "--force").exit_code == 0
    assert count(filled, "events") == 12
    assert count(filled, "attendees") == 46
    assert count(filled, "accounts") == 1


@pytest.mark.parametrize("args", [(), ("--force",)])
def test_demo_data_refuses_production_even_when_forced(app, args):
    app.config.update(PRODUCTION=True, STAGING=False)
    result = run(app, *args)
    assert result.exit_code != 0
    assert "never runs in production mode" in result.output
    assert count(app, "events") == 0


@pytest.mark.parametrize("args", [(), ("--force",)])
def test_demo_data_refuses_a_hosted_database_outside_staging(app, args, monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("demo-data must not connect to a hosted database outside staging")

    app.config.update(STAGING=False, DATABASE_URL="postgresql://someone@db.example.test:5432/postgres")
    monkeypatch.setattr(psycopg, "connect", refuse)
    result = run(app, *args)
    assert result.exit_code != 0
    assert "only fills a hosted database when QUADRA_ENV=staging" in result.output


def test_demo_data_fills_a_local_sqlite_file_in_development(make_app, postgres_url):
    if postgres_url:
        pytest.skip("a development laptop without DATABASE_URL uses sqlite")
    app = make_app(SETTINGS)
    assert run(app).exit_code == 0
    assert count(app, "events") == 6
