import smtplib

import pytest

from app import create_app
from app.db import init_db


@pytest.fixture
def app(tmp_path):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "test.db"),
        "PUBLIC_BASE_URL": "http://localhost:5000",
        "CSRF_ENABLED": False,
        "MAIL_ENABLED": False,
        "STAFF_PIN": "",
        "TODAY": "2026-11-01",
        "EVENT_NAME": "Test Seminar",
        "EVENT_DATE": "November 30, 2026",
        "EVENT_VENUE": "Main Hall",
    })
    with app.app_context():
        init_db()
    yield app


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
