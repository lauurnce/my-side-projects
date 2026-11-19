import re
import smtplib
import threading
import time

import psycopg
import pytest
from conftest import FakeSMTP

from app import accounts, alerts, create_app, routes, staff
from app.db import get_db

OWNER_ADDRESS = "alerts@example.com"
TICKET_SECRET = "s3cretTicketTokenAbCdEf0123456789"
STATUS_SECRET = "s3cretStatusTokenAbCdEf0123456789"
LINK_SECRET = "s3cretPasswordLinkAbCdEf0123456789"
FORM = {"full_name": "Juan Dela Cruz", "email": "juan@example.com", "contact_number": "09171234567"}
PRIVATE_VALUES = (
    "Juan Dela Cruz",
    "juan@example.com",
    "09171234567",
    "session-cookie-value",
    "utm_source",
    "hunter2",
    "local-value-in-the-frame",
    "Mozilla",
    "203.0.113.7",
)


class KnownFailure(Exception):
    pass


def crash():
    get_db().execute("SELECT 1")
    held_in_a_local = "local-value-in-the-frame"
    raise ValueError(f"database password is hunter2 for juan@example.com {held_in_a_local}")


def crash_before_the_database():
    raise KnownFailure("nothing was read yet")


def crash_because_the_database_is_down():
    raise psycopg.OperationalError("connection to server failed for juan@example.com")


def crash_as(number):
    get_db().execute("SELECT 1")
    raise type(f"Failure{number}", (Exception,), {})()


def add_failing_routes(app):
    app.add_url_rule("/crash", view_func=crash, methods=["GET", "POST"])
    app.add_url_rule("/api/crash", endpoint="api_crash", view_func=crash)
    app.add_url_rule("/early", view_func=crash_before_the_database)
    app.add_url_rule("/down", view_func=crash_because_the_database_is_down)
    app.add_url_rule("/crash-as/<int:number>", view_func=crash_as)


@pytest.fixture
def alerting(app, fake_smtp, pass_time):
    app.config.update(ALERT_EMAIL=OWNER_ADDRESS, PROPAGATE_EXCEPTIONS=False)
    add_failing_routes(app)
    return app


@pytest.fixture
def visitor(alerting):
    return alerting.test_client()


def sent_messages(smtp_class):
    return [message for connection in smtp_class.instances for message in connection.sent]


def alert_rows(app):
    with app.app_context():
        rows = get_db().execute("SELECT kind, suppressed FROM error_alerts ORDER BY kind").fetchall()
    return {row["kind"]: row["suppressed"] for row in rows}


def reference_on(page):
    return re.search(r"mention reference <strong>([0-9a-f]{8})</strong>", page).group(1)


def own_log_lines(caplog):
    return [record.getMessage() for record in caplog.records if record.getMessage().startswith("Unhandled error")]


def test_no_alert_is_sent_when_no_address_is_set(visitor, alerting, fake_smtp):
    alerting.config["ALERT_EMAIL"] = ""
    assert visitor.get("/crash").status_code == 500
    assert fake_smtp.instances == []
    assert alert_rows(alerting) == {}


def test_crash_emails_the_owner_what_where_and_when(visitor, fake_smtp, caplog):
    page = visitor.get("/crash").get_data(as_text=True)
    [message] = sent_messages(fake_smtp)
    body = message.get_content()
    reference = reference_on(page)
    assert message["To"] == OWNER_ADDRESS
    assert message["Subject"] == "[Quadra alert] ValueError on GET /crash"
    assert "What: ValueError on GET /crash" in body
    assert "When: 2026-11-20 10:00:00 Manila time" in body
    assert f"Reference: {reference}" in body
    assert "Same problem since the last alert about it: 0" in body
    assert own_log_lines(caplog) == [f"Unhandled error reference={reference}: ValueError on GET /crash"]


def test_alert_has_no_personal_data_form_values_cookies_or_traceback(visitor, fake_smtp):
    visitor.set_cookie("remember", "session-cookie-value")
    response = visitor.post(
        "/crash?utm_source=newsletter&email=juan@example.com",
        data=FORM,
        headers={"User-Agent": "Mozilla/5.0", "X-Forwarded-For": "203.0.113.7"},
    )
    assert response.status_code == 500
    [message] = sent_messages(fake_smtp)
    text = message.as_string()
    assert "ValueError on POST /crash" in text
    assert "Traceback" not in text
    assert "File " not in text
    for private in PRIVATE_VALUES:
        assert private not in text
    assert not message.is_multipart()


def break_view(monkeypatch, module, name):
    def broken(*_args, **_kwargs):
        get_db().execute("SELECT 1")
        raise KnownFailure("lookup failed")

    monkeypatch.setattr(module, name, broken)


@pytest.mark.parametrize(
    ("module", "name", "path", "secret", "shown_as"),
    [
        (routes, "get_attendee_by_token", f"/ticket/{TICKET_SECRET}.png", TICKET_SECRET, "/ticket/<token>.png"),
        (routes, "get_attendee_by_status_token", f"/application/{STATUS_SECRET}", STATUS_SECRET, "/application/<token>"),
        (accounts, "account_for_link", f"/staff/set-password/{LINK_SECRET}", LINK_SECRET, "/staff/set-password/<token>"),
        (staff, "check_in", f"/checkin/{TICKET_SECRET}", TICKET_SECRET, "/checkin/<token>"),
    ],
)
def test_secret_parts_of_the_path_are_never_sent_or_logged(
    alerting, staff_client, fake_smtp, monkeypatch, caplog, module, name, path, secret, shown_as
):
    break_view(monkeypatch, module, name)
    response = staff_client.get(f"{path}?next={secret}")
    assert response.status_code == 500
    [message] = sent_messages(fake_smtp)
    assert secret not in message.as_string()
    assert message["Subject"] == f"[Quadra alert] KnownFailure on GET {shown_as}"
    assert secret not in "".join(own_log_lines(caplog))
    assert secret not in "".join(alert_rows(alerting))


def test_reference_is_in_the_api_answer_too(visitor, fake_smtp):
    body = visitor.get("/api/crash").get_json()
    [message] = sent_messages(fake_smtp)
    assert re.fullmatch(r"[0-9a-f]{8}", body["reference"])
    assert f"Reference: {body['reference']}" in message.get_content()
    assert "hunter2" not in str(body)


def test_pages_that_did_not_crash_show_no_reference_and_send_nothing(visitor, fake_smtp):
    page = visitor.get("/no-such-page").get_data(as_text=True)
    assert "mention reference" not in page
    assert fake_smtp.instances == []


def test_same_failure_alerts_once_per_window_and_counts_the_rest(visitor, alerting, fake_smtp, pass_time):
    for _ in range(4):
        assert visitor.get("/crash").status_code == 500
    assert len(sent_messages(fake_smtp)) == 1
    assert alert_rows(alerting) == {"ValueError on GET /crash": 3}

    pass_time(minutes=59)
    visitor.get("/crash")
    assert len(sent_messages(fake_smtp)) == 1

    pass_time(minutes=2)
    visitor.get("/crash")
    latest = sent_messages(fake_smtp)[-1]
    assert len(sent_messages(fake_smtp)) == 2
    assert "Same problem since the last alert about it: 4" in latest.get_content()
    assert alert_rows(alerting) == {"ValueError on GET /crash": 0}


def test_each_kind_of_failure_gets_its_own_alert(visitor, fake_smtp):
    visitor.get("/crash")
    visitor.post("/crash")
    visitor.get("/crash-as/1")
    subjects = [message["Subject"] for message in sent_messages(fake_smtp)]
    assert subjects == [
        "[Quadra alert] ValueError on GET /crash",
        "[Quadra alert] ValueError on POST /crash",
        "[Quadra alert] Failure1 on GET /crash-as/<int:number>",
    ]


def test_at_most_five_alerts_go_out_per_window_whatever_fails(visitor, alerting, fake_smtp, pass_time):
    for number in range(8):
        visitor.get(f"/crash-as/{number}")
    assert len(sent_messages(fake_smtp)) == alerts.MAX_ALERTS_PER_WINDOW == 5
    assert alert_rows(alerting)["Failure7 on GET /crash-as/<int:number>"] == 1

    pass_time(minutes=61)
    visitor.get("/crash-as/7")
    assert "Same problem since the last alert about it: 1" in sent_messages(fake_smtp)[-1].get_content()


def test_another_instance_shares_the_limit_through_the_database(visitor, alerting, fake_smtp):
    visitor.get("/crash")
    twin = create_app({key: alerting.config[key] for key in ("DATABASE", "DATABASE_URL", "ALERT_EMAIL", "CSRF_ENABLED")})
    twin.config.update(MAIL_ENABLED=True, SMTP_USER="organizer@gmail.com", SMTP_APP_PASSWORD="abcd", PROPAGATE_EXCEPTIONS=False)
    add_failing_routes(twin)
    assert twin.test_client().get("/crash").status_code == 500
    assert len(sent_messages(fake_smtp)) == 1
    assert alert_rows(alerting) == {"ValueError on GET /crash": 1}


def smtp_double(monkeypatch, **behaviour):
    double = type("SMTPDouble", (FakeSMTP,), {"instances": [], **behaviour})
    monkeypatch.setattr(smtplib, "SMTP_SSL", double)
    return double


def test_slow_mail_server_cannot_hold_the_request_past_the_timeout(visitor, monkeypatch, caplog):
    release = threading.Event()
    stuck = smtp_double(monkeypatch, send_message=lambda _self, _message: release.wait(5))
    monkeypatch.setattr(alerts, "ALERT_TIMEOUT_SECONDS", 0.05)
    started = time.monotonic()
    response = visitor.get("/crash")
    waited = time.monotonic() - started
    release.set()
    assert response.status_code == 500
    assert "Something broke on our side" in response.get_data(as_text=True)
    assert waited < 2
    assert stuck.instances[0].timeout == 0.05
    assert "the request stopped waiting" in caplog.text


def test_alert_uses_the_short_timeout_not_the_ticket_mail_timeout(visitor, alerting, fake_smtp):
    visitor.get("/crash")
    assert fake_smtp.instances[0].timeout == alerts.ALERT_TIMEOUT_SECONDS == 6
    assert alerts.ALERT_TIMEOUT_SECONDS < alerting.config["MAIL_TIMEOUT"]


def refuse_login(_self, _user, _password):
    raise smtplib.SMTPAuthenticationError(535, b"bad credentials")


def test_broken_mail_never_breaks_the_error_page_or_loops(visitor, monkeypatch, caplog):
    refusing = smtp_double(monkeypatch, login=refuse_login)
    first = visitor.get("/crash")
    second = visitor.get("/crash")
    assert (first.status_code, second.status_code) == (500, 500)
    assert reference_on(first.get_data(as_text=True)) != reference_on(second.get_data(as_text=True))
    assert len(refusing.instances) == 1
    assert "The alert email was not sent." in caplog.text
    assert len(own_log_lines(caplog)) == 2


def test_missing_mail_settings_do_not_break_the_error_page(visitor, alerting, fake_smtp, caplog):
    alerting.config["SMTP_APP_PASSWORD"] = ""
    response = visitor.get("/crash")
    assert response.status_code == 500
    assert reference_on(response.get_data(as_text=True))
    assert fake_smtp.instances == []
    assert "The alert email was not sent." in caplog.text


def test_failure_while_building_the_alert_is_swallowed(visitor, monkeypatch, caplog):
    def explode(*_args):
        raise RuntimeError("could not build the message")

    monkeypatch.setattr(alerts, "alert_message", explode)
    response = visitor.get("/crash")
    assert response.status_code == 500
    assert "Something broke on our side" in response.get_data(as_text=True)
    assert "The alert was skipped." in caplog.text


def test_with_mail_off_the_alert_is_logged_not_sent(visitor, alerting, fake_smtp, caplog):
    alerting.config["MAIL_ENABLED"] = False
    with caplog.at_level("INFO"):
        visitor.get("/crash")
    assert fake_smtp.instances == []
    assert f"not sending. To: {OWNER_ADDRESS} | Subject: [Quadra alert] ValueError on GET /crash" in caplog.text


def test_without_the_alert_table_each_instance_limits_itself(visitor, alerting, fake_smtp, pass_time):
    with alerting.app_context():
        get_db().execute("DROP TABLE error_alerts")
        get_db().commit()
    for _ in range(3):
        assert visitor.get("/crash").status_code == 500
    [message] = sent_messages(fake_smtp)
    assert "not counted, because the alert table could not be used" in message.get_content()

    pass_time(minutes=61)
    visitor.get("/crash")
    assert len(sent_messages(fake_smtp)) == 2


def test_failure_before_any_query_is_still_counted_in_the_database(visitor, alerting, fake_smtp):
    for _ in range(3):
        assert visitor.get("/early").status_code == 500
    [message] = sent_messages(fake_smtp)
    assert message["Subject"] == "[Quadra alert] KnownFailure on GET /early"
    assert alert_rows(alerting) == {"KnownFailure on GET /early": 2}


def test_when_the_database_is_down_the_alert_does_not_wait_for_it(visitor, alerting, fake_smtp, monkeypatch, pass_time):
    def unreachable():
        raise AssertionError("the alert must not try the database again")

    visitor.get("/")
    monkeypatch.setattr(alerts, "get_db", unreachable)
    for _ in range(3):
        assert visitor.get("/down").status_code == 500
    [message] = sent_messages(fake_smtp)
    assert message["Subject"] == "[Quadra alert] OperationalError on GET /down"
    assert "not counted" in message.get_content()
    assert "juan@example.com" not in message.as_string()

    pass_time(minutes=61)
    visitor.get("/down")
    assert len(sent_messages(fake_smtp)) == 2


def test_path_without_a_route_is_not_echoed(alerting):
    with alerting.test_request_context(f"/ticket/{TICKET_SECRET}"):
        assert alerts.redacted_path() == "(no matching route)"


def test_alerts_work_in_production_mode(make_app, monkeypatch, pass_time):
    smtp_class = smtp_double(monkeypatch)
    app = make_app({
        "PRODUCTION": True,
        "SECRET_KEY": "a-long-random-production-key",
        "MAIL_ENABLED": True,
        "SMTP_USER": "organizer@gmail.com",
        "SMTP_APP_PASSWORD": "abcd efgh ijkl mnop",
        "ALERT_EMAIL": OWNER_ADDRESS,
        "PROPAGATE_EXCEPTIONS": False,
    })
    add_failing_routes(app)
    response = app.test_client().get("/crash", base_url="https://localhost")
    [message] = sent_messages(smtp_class)
    assert response.status_code == 500
    assert f"Reference: {reference_on(response.get_data(as_text=True))}" in message.get_content()
