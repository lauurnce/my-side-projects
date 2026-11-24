import os
import smtplib

import pytest

from app import create_app
from app.db import init_db

BUNDLED_POSTGRES = "pgserver"


@pytest.fixture(scope="session")
def postgres_url(tmp_path_factory):
    url = os.environ.get("TEST_DATABASE_URL")
    if url != BUNDLED_POSTGRES:
        yield url
        return
    import pgserver

    server = pgserver.get_server(tmp_path_factory.mktemp("postgres"), cleanup_mode="delete")
    yield server.get_uri()
    server.cleanup()


@pytest.fixture
def make_app(tmp_path, postgres_url):
    def build(config):
        app = create_app({
            "TESTING": True,
            "DATABASE": str(tmp_path / "test.db"),
            "DATABASE_URL": postgres_url,
            **config,
        })
        with app.app_context():
            init_db(force=True)
        return app

    return build


@pytest.fixture
def app(make_app):
    return make_app({
        "PUBLIC_BASE_URL": "http://localhost:5000",
        "CSRF_ENABLED": False,
        "MAIL_ENABLED": False,
        "STAFF_PIN": "",
        "TODAY": "2026-11-01",
        "EVENT_NAME": "Test Seminar",
        "EVENT_DATE": "November 30, 2026",
        "EVENT_VENUE": "Main Hall",
    })


@pytest.fixture(autouse=True)
def block_real_smtp(monkeypatch):

    def refuse(*_args, **_kwargs):
        raise RuntimeError("Tests must not send real email. Use the fake_smtp fixture.")

    monkeypatch.setattr(smtplib, "SMTP_SSL", refuse)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def valid_form():
    return {
        "full_name": "Juan Dela Cruz",
        "email": "juan@example.com",
        "organization": "PUP",
        "contact_number": "09171234567",
    }
