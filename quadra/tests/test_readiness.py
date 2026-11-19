import pytest

from app import create_app, readiness
from app.db import drop_tables, get_db, migrate, shipped_migrations

LATEST = shipped_migrations("sqlite")[-1]
OWNER_ADDRESS = "alerts@example.com"


def run(app, sql, values=()):
    with app.app_context():
        get_db().execute(sql, values)
        get_db().commit()


def forget_latest_migration(app):
    run(app, "DELETE FROM schema_migrations WHERE name = %s", (LATEST,))


def catch_up(app):
    with app.app_context():
        get_db().execute("DROP TABLE IF EXISTS error_alerts")
        get_db().commit()
        migrate()


@pytest.fixture
def behind(app):
    forget_latest_migration(app)
    return app


@pytest.fixture
def checks(monkeypatch):
    made = []
    real = readiness.missing_migrations

    def counted():
        made.append(1)
        return real()

    monkeypatch.setattr(readiness, "missing_migrations", counted)
    return made


def test_ready_answers_ok_when_the_database_is_current(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "database": "ok", "schema": "current"}


def test_ready_is_not_cached_by_browsers_or_indexed(client):
    response = client.get("/ready")
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Robots-Tag"] == "noindex, nofollow"
    assert "/ready" not in client.get("/sitemap.xml").get_data(as_text=True)


def test_ready_asks_the_database_at_most_once_per_quarter_minute(client, checks, pass_time):
    for _ in range(20):
        assert client.get("/ready").status_code == 200
    assert len(checks) == 1
    pass_time(seconds=14)
    client.get("/ready")
    assert len(checks) == 1
    pass_time(seconds=2)
    client.get("/ready")
    assert len(checks) == 2


def test_ready_says_the_schema_is_behind_without_naming_files(behind, client, caplog):
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.get_json() == {"status": "unavailable", "database": "ok", "schema": "behind"}
    assert LATEST not in response.get_data(as_text=True)
    assert LATEST in caplog.text


def test_ready_notices_the_migration_after_its_answer_expires(behind, client, pass_time):
    assert client.get("/ready").status_code == 503
    catch_up(behind)
    assert client.get("/ready").status_code == 503
    pass_time(seconds=16)
    assert client.get("/ready").status_code == 200


def test_ready_says_unreachable_without_details_when_the_database_fails(client, monkeypatch, caplog):
    def fail():
        raise RuntimeError("could not connect to db.example.com as quadra_app with password hunter2")

    monkeypatch.setattr(readiness, "missing_migrations", fail)
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.get_json() == {"status": "unavailable", "database": "unreachable", "schema": "unknown"}
    assert "hunter2" not in response.get_data(as_text=True)
    assert "The readiness check could not use the database." in caplog.text


def test_ready_reports_a_database_with_no_tables_as_behind(app, client):
    with app.app_context():
        drop_tables()
    assert client.get("/ready").get_json()["schema"] == "behind"


def test_health_still_answers_without_the_database(behind, client, checks):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}
    assert checks == []


@pytest.mark.parametrize("path", ["/", "/events/test-seminar", "/privacy", "/staff/login", "/sitemap.xml"])
def test_pages_answer_503_with_a_maintenance_page_while_migrations_are_missing(behind, client, path):
    response = client.get(path)
    html = response.get_data(as_text=True)
    assert response.status_code == 503
    assert "<h1>We will be right back</h1>" in html
    assert "The site is being updated. Try again in a few minutes." in html
    assert "css/style.css" in html
    assert response.headers["X-Robots-Tag"] == "noindex, nofollow"
    assert LATEST not in html


def test_forms_and_the_api_are_held_too(behind, client, valid_form):
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 503
    api = client.post("/api/checkin", json={"token": "anything"})
    assert api.status_code == 503
    assert api.get_json() == {
        "status": "error",
        "code": 503,
        "message": "The site is being updated. Try again in a few minutes.",
    }
    with behind.app_context():
        assert get_db().execute("SELECT COUNT(*) AS total FROM attendees").fetchone()["total"] == 0


def test_static_files_are_still_served_while_held(behind, client):
    assert client.get("/static/css/style.css").status_code == 200


def test_signed_in_staff_get_the_maintenance_page_not_a_crash(app, staff_client):
    forget_latest_migration(app)
    twin = create_app({key: app.config[key] for key in ("DATABASE", "DATABASE_URL", "SECRET_KEY")})
    client = twin.test_client()
    with staff_client.session_transaction() as signed_in, client.session_transaction() as copied:
        copied.update(signed_in)
    response = client.get("/admin")
    assert response.status_code == 503
    assert "Log out" not in response.get_data(as_text=True)


def test_missing_migrations_are_logged_loudly(behind, client, caplog):
    client.get("/")
    [record] = [record for record in caplog.records if record.levelname == "CRITICAL"]
    assert "DATABASE IS BEHIND THE CODE" in record.getMessage()
    assert LATEST in record.getMessage()
    assert "flask --app app migrate" in record.getMessage()


def test_database_with_no_tables_gets_the_maintenance_page_not_a_500(app, client):
    with app.app_context():
        drop_tables()
    response = client.get("/")
    assert response.status_code == 503
    assert "We will be right back" in response.get_data(as_text=True)


def test_current_database_is_checked_once_per_instance(client, checks):
    for path in ["/", "/events/test-seminar", "/privacy", "/staff/login", "/"]:
        assert client.get(path).status_code == 200
    assert len(checks) == 1


def test_held_instance_rechecks_every_ten_seconds_and_recovers_after_migrate(behind, client, checks, pass_time):
    for _ in range(5):
        assert client.get("/").status_code == 503
    assert len(checks) == 1

    catch_up(behind)
    assert client.get("/").status_code == 503
    pass_time(seconds=11)
    assert client.get("/").status_code == 200
    assert len(checks) == 2

    pass_time(minutes=5)
    assert client.get("/").status_code == 200
    assert len(checks) == 2


def test_database_ahead_of_the_code_is_served_normally(app, client):
    run(app, "INSERT INTO schema_migrations (name, applied_at) VALUES ('0099_future.sql', '2026-11-20T02:00:00+00:00')")
    assert client.get("/").status_code == 200
    assert client.get("/ready").status_code == 200


def test_instance_checks_again_after_an_unhandled_error(app, checks):
    def crash():
        raise ValueError("boom")

    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.add_url_rule("/crash", view_func=crash)
    client = app.test_client()
    client.get("/")
    client.get("/")
    assert len(checks) == 1
    assert client.get("/crash").status_code == 500
    forget_latest_migration(app)
    assert client.get("/").status_code == 503
    assert len(checks) == 2


def test_owner_is_emailed_once_when_the_database_is_behind(behind, fake_smtp, pass_time):
    behind.config["ALERT_EMAIL"] = OWNER_ADDRESS
    client = behind.test_client()
    client.get("/")
    pass_time(seconds=11)
    client.get("/events/test-seminar")
    pass_time(seconds=11)
    client.get("/")
    [message] = [message for connection in fake_smtp.instances for message in connection.sent]
    assert message["To"] == OWNER_ADDRESS
    assert message["Subject"] == f"[Quadra alert] The database is missing migrations the code needs ({LATEST})"
    assert "Reference: none" in message.get_content()


def test_owner_is_emailed_even_when_the_alert_table_is_the_missing_migration(behind, fake_smtp, pass_time):
    run(behind, "DROP TABLE error_alerts")
    behind.config["ALERT_EMAIL"] = OWNER_ADDRESS
    client = behind.test_client()
    assert client.get("/").status_code == 503
    pass_time(seconds=11)
    assert client.get("/").status_code == 503
    [message] = [message for connection in fake_smtp.instances for message in connection.sent]
    assert LATEST in message["Subject"]
    assert "not counted" in message.get_content()
