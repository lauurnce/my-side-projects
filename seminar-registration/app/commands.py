import click
from flask import current_app
from flask.cli import with_appcontext

from .services.registration import deliver_ticket, get_attendee_by_code, regenerate_qr_codes


@click.command("regenerate-qr")
@click.option("--code", help="Only rebuild the QR for this attendee code, e.g. SEM-2026-0001.")
@with_appcontext
def regenerate_qr_command(code):
    """Rebuild ticket QR images (run this after changing PUBLIC_BASE_URL)."""
    rebuilt = regenerate_qr_codes(code)
    if code and not rebuilt:
        raise click.ClickException(f"No attendee with code {code}.")
    for item in rebuilt:
        click.echo(f"Rebuilt {item}")
    click.echo(f"Done. {len(rebuilt)} QR code(s) rebuilt.")


@click.command("resend-ticket")
@click.option("--code", required=True, help="Attendee code to email again, e.g. SEM-2026-0001.")
@with_appcontext
def resend_ticket_command(code):
    """Email the ticket to one attendee again."""
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


def init_app(app):
    app.cli.add_command(regenerate_qr_command)
    app.cli.add_command(resend_ticket_command)
