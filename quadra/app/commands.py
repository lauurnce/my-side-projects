import socket

import click
from flask import current_app
from flask.cli import with_appcontext

from .services.events import create_event, parse_date
from .services.registration import deliver_ticket, get_attendee_by_code


@click.command("resend-ticket", help="Email the ticket to one attendee again.")
@click.option("--code", required=True, help="Attendee code to email again, e.g. SEM-2026-0001.")
@with_appcontext
def resend_ticket_command(code):
    attendee = get_attendee_by_code(code)
    if attendee is None:
        raise click.ClickException(f"No attendee with code {code}.")
    if not current_app.config["MAIL_ENABLED"]:
        deliver_ticket(attendee)
        click.echo("MAIL_ENABLED is off, so the email was logged instead of sent.")
        return
    attendee = deliver_ticket(attendee)
    if attendee["email_status"] != "sent":
        raise click.ClickException(f"Sending the ticket for {code} failed. Check the log above.")
    click.echo(f"Ticket for {code} sent to {attendee['email']}.")


@click.command("add-event", help="Add an event that people can register for.")
@click.option("--name", required=True, help="Event name.")
@click.option("--date", "event_date", required=True, help="Event date, e.g. 2026-11-30.")
@click.option("--venue", required=True, help="Where the event is held.")
@click.option("--opens", help="Date registration opens, e.g. 2026-11-01. Open now if omitted.")
@with_appcontext
def add_event_command(name, event_date, venue, opens):
    day = parse_date(event_date)
    opens_on = parse_date(opens) if opens else None
    if day is None or (opens and opens_on is None):
        raise click.ClickException("Dates must look like 2026-11-30.")
    event = create_event(name, day, venue, opens_on)
    click.echo(f"Added {event['name']} at /events/{event['slug']}")


def lan_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("10.255.255.255", 1))
        except OSError:
            return "127.0.0.1"
        return probe.getsockname()[0]


@click.command("lan-url", help="Print the address phones on the same network can use.")
@click.option("--port", default=5000, show_default=True, help="Port the app runs on.")
def lan_url_command(port):
    url = f"http://{lan_ip()}:{port}"
    click.echo(f"LAN address: {url}")
    click.echo(f"Run the app with: flask --app app run --host 0.0.0.0 --port {port}")
    click.echo(f"Set PUBLIC_BASE_URL={url} in .env, then restart the app.")


def init_app(app):
    app.cli.add_command(resend_ticket_command)
    app.cli.add_command(lan_url_command)
    app.cli.add_command(add_event_command)
