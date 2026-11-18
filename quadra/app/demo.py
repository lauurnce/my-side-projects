from datetime import timedelta

import click
from flask import current_app
from flask.cli import with_appcontext

from .clock import utc_timestamp
from .db import get_db
from .services.accounts import create_account, disable_account, get_account_by_email
from .services.checkin import check_in
from .services.events import create_event, list_events, today, update_event
from .services.registration import create_attendee
from .services.review import decide

REVIEWER_EMAIL = "demo.reviewer@example.test"
REVIEWER_NAME = "Demo Reviewer"
ORGANIZATIONS = (
    "PUP College of Computer and Information Sciences",
    "PUP College of Engineering",
    "PUP College of Business Administration",
    "PUP Junior Philippine Computer Society",
)
PEOPLE = (
    "Althea Ramos", "Benjie Castillo", "Carmela Javier", "Dindo Mercado", "Erlinda Pascual",
    "Felix Navarro", "Gemma Soriano", "Hernan Aquino", "Imelda Villanueva", "Jomar Salazar",
    "Katrina Bautista", "Lorenzo Manalo", "Maricel Domingo", "Nestor Ocampo", "Olivia Tolentino",
    "Paolo Guevarra", "Queenie Marasigan", "Ramon Evangelista", "Shiela Cordero", "Teodoro Lacson",
    "Ursula Magbanua", "Vicente Rosales", "Wilma Custodio", "Xander Belmonte", "Yolanda Pangilinan",
    "Zaldy Ferrer", "Amparo Lualhati", "Basilio Trinidad", "Corazon Abad", "Danilo Macaraeg",
)
WAITING = ("pending", "none", False)
ACCEPTED = ("accepted", "sent", False)
ACCEPTED_EMAIL_WAITING = ("accepted", "pending", False)
ACCEPTED_AND_CHECKED_IN = ("accepted", "sent", True)
DECLINED = ("declined", "sent", False)
DECLINED_EMAIL_FAILED = ("declined", "failed", False)
EVENTS = (
    {
        "name": "Campus Tech Summit (demo)",
        "venue": "Demo Hall A, PUP Main Campus",
        "days_away": 21,
        "applicants": (WAITING,) * 5 + (ACCEPTED, ACCEPTED, ACCEPTED_EMAIL_WAITING, DECLINED, DECLINED_EMAIL_FAILED),
    },
    {
        "name": "Freshmen Welcome Night (demo)",
        "venue": "Demo Gymnasium, PUP Main Campus",
        "days_away": 10,
        "review_applications": False,
        "applicants": (ACCEPTED,) * 3 + (ACCEPTED_EMAIL_WAITING,),
    },
    {
        "name": "Research Colloquium (demo)",
        "venue": "Demo Library Annex",
        "days_away": 35,
        "published": False,
    },
    {
        "name": "Career Fair (demo)",
        "venue": "Demo Covered Court",
        "days_away": 14,
        "registration_closed": True,
        "applicants": (ACCEPTED, ACCEPTED, WAITING),
    },
    {
        "name": "Hackathon Kickoff (demo)",
        "venue": "Demo Innovation Lab",
        "days_away": 45,
        "opens_in_days": 7,
    },
    {
        "name": "Alumni Homecoming Forum (demo)",
        "venue": "Demo Auditorium",
        "days_away": -7,
        "applicants": (ACCEPTED_AND_CHECKED_IN,) * 3 + (ACCEPTED, DECLINED, WAITING),
    },
)


def refusal(force):
    config = current_app.config
    if config["PRODUCTION"]:
        return "demo-data never runs in production mode."
    if config["DATABASE_URL"] and not config["STAGING"]:
        return (
            "DATABASE_URL is set, so this could be the live database."
            " demo-data only fills a hosted database when QUADRA_ENV=staging."
        )
    if list_events() and not force:
        return "This database already has events. Add --force to add the demo events next to them."
    return None


def demo_reviewer():
    account = get_account_by_email(REVIEWER_EMAIL)
    if account is None:
        account = create_account(REVIEWER_EMAIL, "admin", REVIEWER_NAME)
        disable_account(account["id"])
    return account


def add_event(spec):
    day = today() + timedelta(days=spec["days_away"])
    opens_on = today() + timedelta(days=spec["opens_in_days"]) if "opens_in_days" in spec else None
    event = create_event(
        spec["name"],
        day,
        spec["venue"],
        opens_on,
        published=spec.get("published", True),
        review_applications=spec.get("review_applications", True),
    )
    if spec.get("registration_closed"):
        update_event(event["id"], None, registration_closed=1)
    return event


def add_applicant(event, number, applicant, reviewer_id):
    state, email_status, checked_in = applicant
    name = PEOPLE[number % len(PEOPLE)]
    attendee = create_attendee(
        event["id"],
        f"{name} (demo)",
        f"{name.lower().replace(' ', '.')}@example.test",
        ORGANIZATIONS[number % len(ORGANIZATIONS)],
        f"+63900000{number:04d}",
        state="pending" if event["review_applications"] else "accepted",
    )
    if event["review_applications"] and state != "pending":
        decide(event["id"], state, reviewer_id, [attendee["id"]])
    db = get_db()
    db.execute(
        "UPDATE attendees SET email_status = %s, email_sent_at = %s WHERE id = %s",
        (email_status, utc_timestamp() if email_status == "sent" else None, attendee["id"]),
    )
    db.commit()
    if checked_in:
        check_in(attendee["ticket_token"], reviewer_id)


def add_demo_data():
    reviewer_id = demo_reviewer()["id"]
    number = 0
    events = []
    for spec in EVENTS:
        event = add_event(spec)
        for applicant in spec.get("applicants", ()):
            add_applicant(event, number, applicant, reviewer_id)
            number += 1
        events.append(event)
    return events, number


@click.command("demo-data", help="Fill an empty test database with clearly fake events and applicants. Sends no email.")
@click.option("--force", is_flag=True, help="Add the demo events even when the database already has events.")
@with_appcontext
def demo_data_command(force):
    problem = refusal(force)
    if problem:
        raise click.ClickException(problem)
    events, applicants = add_demo_data()
    for event in events:
        click.echo(f"Added {event['name']} at /events/{event['slug']}")
    click.echo(f"Added {applicants} applicants with @example.test addresses. No email was sent.")


def init_app(app):
    app.cli.add_command(demo_data_command)
