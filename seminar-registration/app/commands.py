import click
from flask.cli import with_appcontext

from .services.registration import regenerate_qr_codes


@click.command("regenerate-qr")
@click.option("--code", help="Only rebuild the QR for this attendee code, e.g. SEM-2026-0001.")
@with_appcontext
def regenerate_qr_command(code):
    """Rebuild ticket QR images (run this after changing PUBLIC_BASE_URL)."""
    rebuilt = regenerate_qr_codes(code)
    for item in rebuilt:
        click.echo(f"Rebuilt {item}")
    click.echo(f"Done. {len(rebuilt)} QR code(s) rebuilt.")


def init_app(app):
    app.cli.add_command(regenerate_qr_command)
