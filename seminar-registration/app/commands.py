import socket

import click
from flask import current_app
from flask.cli import with_appcontext

from .services.registration import (
    deliver_ticket,
    get_attendee_by_code,
    regenerate_qr_codes,
)


@click.command("regenerate-qr", help="Rebuild ticket QR images after changing PUBLIC_BASE_URL.")
@click.option("--code", help="Only rebuild the QR for this attendee code, e.g. SEM-2026-0001.")
@with_appcontext
def regenerate_qr_command(code):
    rebuilt = regenerate_qr_codes(code)
    if code and not rebuilt:
        raise click.ClickException(f"No attendee with code {code}.")
    for item in rebuilt:
        click.echo(f"Rebuilt {item}")
    click.echo(f"Done. {len(rebuilt)} QR code(s) rebuilt.")


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
    click.echo(f"Set PUBLIC_BASE_URL={url} in .env, then run: flask --app app regenerate-qr")


def init_app(app):
    app.cli.add_command(regenerate_qr_command)
    app.cli.add_command(resend_ticket_command)
    app.cli.add_command(lan_url_command)
