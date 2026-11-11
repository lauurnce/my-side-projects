import pytest

from app import create_app
from app.db import init_db


@pytest.fixture
def app(tmp_path):
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "test.db"),
        "CSRF_ENABLED": False,
        "EVENT_NAME": "Test Seminar",
        "EVENT_DATE": "November 30, 2026",
        "EVENT_VENUE": "Main Hall",
    })
    with app.app_context():
        init_db()
    yield app


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
