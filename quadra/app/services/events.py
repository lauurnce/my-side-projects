import re
from datetime import date, datetime

from flask import current_app

from ..clock import manila_time, manila_today, utc_timestamp
from ..db import get_db

DATE_FORMATS = ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y")
MAX_NAME_LENGTH = 120
MAX_VENUE_LENGTH = 150
STATES_BY_PRECEDENCE = (
    ("ended", lambda event, current: event["event_date"] < current),
    ("draft", lambda event, current: not event["published"]),
    ("closed", lambda event, current: bool(event["registration_closed"])),
    ("soon", lambda event, current: bool(event["opens_on"]) and event["opens_on"] > current),
    ("open", lambda event, current: True),
)


def today():
    fixed = current_app.config.get("TODAY")
    return date.fromisoformat(fixed) if fixed else manila_today()


def parse_date(text):
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime((text or "").strip(), date_format).date()
        except ValueError:
            continue
    return None


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "event"


def free_slug(name):
    base = slugify(name)
    slug, suffix = base, 2
    while get_event_by_slug(slug) is not None:
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def create_event(name, event_date, venue, opens_on=None, created_by_id=None, published=True):
    db = get_db()
    slug = free_slug(name)
    db.execute(
        "INSERT INTO events (slug, name, event_date, venue, opens_on, created_at, created_by_id, published)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (
            slug,
            name,
            event_date.isoformat(),
            venue,
            opens_on.isoformat() if opens_on else None,
            utc_timestamp(),
            created_by_id,
            int(published),
        ),
    )
    db.commit()
    return get_event_by_slug(slug)


def validate_event(form):
    data = {key: (form.get(key) or "").strip() for key in ("name", "event_date", "venue", "opens_on")}
    errors = {}
    if not data["name"]:
        errors["name"] = "Event name is required."
    elif len(data["name"]) > MAX_NAME_LENGTH:
        errors["name"] = f"Event name must be at most {MAX_NAME_LENGTH} characters."
    if not data["venue"]:
        errors["venue"] = "Venue is required."
    elif len(data["venue"]) > MAX_VENUE_LENGTH:
        errors["venue"] = f"Venue must be at most {MAX_VENUE_LENGTH} characters."

    event_date = parse_date(data["event_date"])
    if event_date is None:
        errors["event_date"] = "Pick the event date."
    opens_on = parse_date(data["opens_on"]) if data["opens_on"] else None
    if data["opens_on"] and opens_on is None:
        errors["opens_on"] = "Pick a valid opening date, or leave it empty."
    elif opens_on and event_date and opens_on > event_date:
        errors["opens_on"] = "Registration must open on or before the event date."
    return {"name": data["name"], "event_date": event_date, "venue": data["venue"], "opens_on": opens_on}, errors


def seed_from_config():
    config = current_app.config
    event_date = parse_date(config["EVENT_DATE"])
    if event_date is None:
        return None
    return create_event(config["EVENT_NAME"], event_date, config["EVENT_VENUE"])


def get_event_by_slug(slug):
    return get_db().execute("SELECT * FROM events WHERE slug = %s", (slug,)).fetchone()


def list_events():
    return get_db().execute("SELECT * FROM events ORDER BY event_date, id").fetchall()


def list_upcoming():
    return get_db().execute(
        "SELECT * FROM events WHERE published = 1 AND event_date >= %s ORDER BY event_date, id",
        (today().isoformat(),),
    ).fetchall()


def registration_state(event):
    current = today().isoformat()
    return next(state for state, applies in STATES_BY_PRECEDENCE if applies(event, current))


def long_date(iso_date):
    day = date.fromisoformat(iso_date)
    return f"{day:%B} {day.day}, {day.year}"


def short_date(iso_date):
    day = date.fromisoformat(iso_date)
    return f"{day:%b} {day.day}"


def month_label(iso_date):
    return f"{date.fromisoformat(iso_date):%b}".upper()


def day_label(iso_date):
    return f"{date.fromisoformat(iso_date).day:02d}"


def init_app(app):
    app.jinja_env.filters.update(
        long_date=long_date,
        short_date=short_date,
        month_label=month_label,
        day_label=day_label,
        manila_time=manila_time,
    )
    app.jinja_env.globals["registration_state"] = registration_state
