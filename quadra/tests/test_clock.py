from datetime import date

import pytest

from app import clock
from app.services import events


@pytest.mark.parametrize(
    "stored, shown",
    [
        ("2026-11-30T08:15:00+00:00", "Nov 30, 2026 4:15 PM"),
        ("2026-11-30T16:05:00+00:00", "Dec 1, 2026 12:05 AM"),
        ("2026-12-31T19:59:59+00:00", "Jan 1, 2027 3:59 AM"),
        ("2026-11-30T04:00:00+00:00", "Nov 30, 2026 12:00 PM"),
        ("2026-11-30T12:15:00+08:00", "Nov 30, 2026 12:15 PM"),
        ("2026-11-30 08:15:00", "Nov 30, 2026 8:15 AM"),
        (None, ""),
        ("", ""),
    ],
)
def test_manila_time(stored, shown):
    assert clock.manila_time(stored) == shown


def test_utc_timestamp_is_utc_to_the_second(freeze):
    freeze("2026-11-30T08:15:42.987654")
    assert clock.utc_timestamp() == "2026-11-30T08:15:42+00:00"


def test_manila_today_is_ahead_of_utc_after_four_in_the_afternoon(freeze):
    freeze("2026-11-29T15:59:59")
    assert clock.manila_today() == date(2026, 11, 29)
    freeze("2026-11-29T16:00:00")
    assert clock.manila_today() == date(2026, 11, 30)


def test_today_is_the_manila_date(app, freeze):
    app.config["TODAY"] = None
    freeze("2026-11-29T16:00:00")
    with app.app_context():
        assert events.today() == date(2026, 11, 30)


def test_today_honours_the_override(app, freeze):
    freeze("2026-11-29T16:00:00")
    with app.app_context():
        assert events.today() == date(2026, 11, 1)


def test_event_closes_at_manila_midnight_not_utc_midnight(app, client, freeze):
    app.config["TODAY"] = None
    freeze("2026-11-30T15:59:00")
    assert 'action="/events/test-seminar/register"' in client.get("/events/test-seminar").get_data(as_text=True)
    freeze("2026-11-30T16:00:00")
    assert 'action="/events/test-seminar/register"' not in client.get("/events/test-seminar").get_data(as_text=True)
