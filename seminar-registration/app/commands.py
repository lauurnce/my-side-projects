import click
from flask.cli import with_appcontext

from .services.registration import regenerate_qr_codes


@click.command("regenerate-qr")
@with_appcontext
def regenerate_qr_command():
    """Rebuild ticket QR images (run this after changing PUBLIC_BASE_URL)."""
    rebuilt = regenerate_qr_codes()
    for item in rebuilt:
        click.echo(f"Rebuilt {item}")
    click.echo(f"Done. {len(rebuilt)} QR code(s) rebuilt.")


def init_app(app):
    app.cli.add_command(regenerate_qr_command)
