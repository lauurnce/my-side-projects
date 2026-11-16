import os
import smtplib
from datetime import UTC, datetime, timedelta

import pytest

from app import clock, create_app
from app.db import get_db, init_db
from app.services.accounts import change_password, create_account, get_account

BUNDLED_POSTGRES = "pgserver"
PASSWORD = "correct-horse-battery"


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


def set_review(app, slug, review_applications):
    with app.app_context():
        get_db().execute(
            "UPDATE events SET review_applications = %s WHERE slug = %s", (int(review_applications), slug)
        )
        get_db().commit()


@pytest.fixture
def app(make_app):
    app = make_app({
        "PUBLIC_BASE_URL": "http://localhost:5000",
        "CSRF_ENABLED": False,
        "MAIL_ENABLED": False,
        "TODAY": "2026-11-01",
        "EVENT_NAME": "Test Seminar",
        "EVENT_DATE": "November 30, 2026",
        "EVENT_VENUE": "Main Hall",
    })
    set_review(app, "test-seminar", False)
    return app


@pytest.fixture
def reviewing(app):
    set_review(app, "test-seminar", True)
    return app


@pytest.fixture(autouse=True)
def block_real_smtp(monkeypatch):

    def refuse(*_args, **_kwargs):
        raise RuntimeError("Tests must not send real email. Use the fake_smtp fixture.")

    monkeypatch.setattr(smtplib, "SMTP_SSL", refuse)


class FakeSMTP:

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.login_args = None
        self.sent = []
        self.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def login(self, user, password):
        self.login_args = (user, password)

    def send_message(self, message):
        self.sent.append(message)


@pytest.fixture
def fake_smtp(app, monkeypatch):
    app.config.update(
        MAIL_ENABLED=True,
        SMTP_USER="organizer@gmail.com",
        SMTP_APP_PASSWORD="abcd efgh ijkl mnop",
        MAIL_FROM_NAME="Seminar Team",
    )
    smtp_class = type("FakeSMTPForTest", (FakeSMTP,), {"instances": []})
    monkeypatch.setattr(smtplib, "SMTP_SSL", smtp_class)
    return smtp_class


class FrozenDatetime(datetime):
    frozen = None

    @classmethod
    def now(cls, tz=None):
        return cls.frozen.astimezone(tz)


@pytest.fixture(autouse=True)
def waits(monkeypatch):
    waited = []
    monkeypatch.setattr(clock, "wait", waited.append)
    return waited


@pytest.fixture
def freeze(monkeypatch):
    def at(iso_utc):
        FrozenDatetime.frozen = datetime.fromisoformat(iso_utc).replace(tzinfo=UTC)
        monkeypatch.setattr(clock, "datetime", FrozenDatetime)

    return at


@pytest.fixture
def pass_time(freeze):
    freeze("2026-11-20T02:00:00")

    def forward(**amount):
        FrozenDatetime.frozen += timedelta(**amount)

    return forward


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def make_account(app):
    def make(email, name="Sam Staff", role="admin", password=PASSWORD):
        with app.app_context():
            account = create_account(email, role, name)
            if password:
                change_password(account["id"], password)
            return {**get_account(account["id"]), "password": password}

    return make


@pytest.fixture
def staff(make_account):
    return make_account("staff@example.com")


@pytest.fixture
def owner(make_account):
    return make_account("owner@example.com", "Olivia Owner", "owner")


@pytest.fixture
def sign_in(app):
    def post(account, client=None, **form):
        client = client or app.test_client()
        credentials = {"email": account["email"], "password": account["password"]}
        assert client.post("/staff/login", data={**credentials, **form}).status_code == 302
        return client

    return post


@pytest.fixture
def staff_client(client, staff, sign_in):
    return sign_in(staff, client)


@pytest.fixture
def owner_client(client, owner, sign_in):
    return sign_in(owner, client)


@pytest.fixture
def valid_form():
    return {
        "full_name": "Juan Dela Cruz",
        "email": "juan@example.com",
        "organization": "PUP",
        "contact_number": "09171234567",
    }
