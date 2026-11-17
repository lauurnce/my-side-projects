import csv
import io
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest

from app.db import get_db
from app.services import delivery, review
from app.services.events import get_event_by_slug

DECIDE = "/admin/events/test-seminar/decide"
SEND = "/admin/events/test-seminar/emails"


def person(number):
    return {
        "full_name": f"Person {number}",
        "email": f"person{number}@example.com",
        "organization": "PUP",
        "contact_number": f"0917123450{number}",
        "consent": "yes",
    }


def apply(client, number=1):
    response = client.post("/events/test-seminar/register", data=person(number))
    assert response.status_code == 302
    return response


def rows(app):
    with app.app_context():
        return get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()


def row(app, number=1):
    return rows(app)[number - 1]


def update_rows(app, assignment):
    with app.app_context():
        get_db().execute(f"UPDATE attendees SET {assignment}")
        get_db().commit()


def recipients(fake_smtp):
    return [message["To"] for smtp in fake_smtp.instances for message in smtp.sent]


def messages_to(fake_smtp, address):
    return [message for smtp in fake_smtp.instances for message in smtp.sent if message["To"] == address]


def decide(client, action, *ids):
    return client.post(DECIDE, data={"action": action, "ids": [str(value) for value in ids]}, follow_redirects=True)


@pytest.fixture
def small_batches(monkeypatch):
    monkeypatch.setattr(delivery, "EMAIL_BATCH_SIZE", 3)


@pytest.fixture
def applicants(reviewing, client):
    for number in range(1, 4):
        apply(client, number)
    return reviewing


def test_applying_to_a_review_event_creates_a_pending_application(reviewing, client):
    response = apply(client)
    assert response.headers["Location"].endswith("/registered/SEM-2026-0001")
    application = row(reviewing)
    assert (application["state"], application["decided_at"], application["decided_by_id"]) == ("pending", None, None)
    assert application["email_status"] == "none"
    assert len(application["status_token"]) >= 40


def test_applying_to_a_review_event_sends_and_logs_no_email(reviewing, client, fake_smtp, caplog):
    with caplog.at_level("INFO"):
        apply(client)
    assert fake_smtp.instances == []
    assert "person1@example.com" not in caplog.text
    assert row(reviewing)["email_sent_at"] is None


def test_the_page_after_applying_says_under_review_and_has_no_qr(reviewing, client):
    html = client.post("/events/test-seminar/register", data=person(1), follow_redirects=True).get_data(as_text=True)
    assert "Application received" in html
    assert "under review" in html
    assert "/ticket/" not in html
    assert "<img" not in html
    assert f"/application/{row(reviewing)['status_token']}" in html


def test_registering_for_an_automatic_event_is_accepted_at_once(app, client, fake_smtp):
    html = client.post("/events/test-seminar/register", data=person(1), follow_redirects=True).get_data(as_text=True)
    attendee = row(app)
    assert (attendee["state"], attendee["decided_by_id"], attendee["email_status"]) == ("accepted", None, "sent")
    assert attendee["decided_at"]
    assert "Registration complete" in html
    assert f"/ticket/{attendee['ticket_token']}.png" in html
    assert messages_to(fake_smtp, "person1@example.com")[0]["Subject"] == "Your ticket: Test Seminar"


def test_review_event_page_talks_about_applying(reviewing, client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert "<h2>Apply</h2>" in html
    assert "emailed once you are accepted" in html


def test_status_page_shows_a_pending_application_without_a_ticket(reviewing, client):
    apply(client)
    html = reviewing.test_client().get(f"/application/{row(reviewing)['status_token']}").get_data(as_text=True)
    assert '<dd id="application-state">Pending</dd>' in html
    assert "under review" in html
    assert "/ticket/" not in html


def test_status_page_shows_the_ticket_once_accepted(reviewing, client, staff_client):
    apply(client)
    decide(staff_client, "accept", 1)
    application = row(reviewing)
    html = reviewing.test_client().get(f"/application/{application['status_token']}").get_data(as_text=True)
    assert '<dd id="application-state">Accepted</dd>' in html
    assert "Application accepted" in html
    assert f'src="/ticket/{application["ticket_token"]}.png"' in html
    assert f'href="/ticket/{application["ticket_token"]}.png?download=1"' in html


def test_status_page_shows_a_declined_application_without_a_ticket(reviewing, client, staff_client):
    apply(client)
    decide(staff_client, "decline", 1)
    html = reviewing.test_client().get(f"/application/{row(reviewing)['status_token']}").get_data(as_text=True)
    assert '<dd id="application-state">Declined</dd>' in html
    assert "could not offer you a place" in html
    assert "/ticket/" not in html


def test_status_page_is_404_for_an_unknown_or_ticket_token(reviewing, client):
    apply(client)
    assert client.get("/application/not-a-real-token").status_code == 404
    assert client.get(f"/application/{row(reviewing)['ticket_token']}").status_code == 404


@pytest.mark.parametrize(
    ("action", "shown"),
    [(None, "under review"), ("accept", "You're in"), ("decline", "could not offer you a place")],
)
def test_session_confirmation_page_follows_the_state(reviewing, client, staff, sign_in, action, shown):
    apply(client)
    if action:
        decide(sign_in(staff), action, 1)
    response = client.get("/registered/SEM-2026-0001")
    assert response.status_code == 200
    assert shown in response.get_data(as_text=True)
    assert 'href="/registered/SEM-2026-0001"' in client.get("/").get_data(as_text=True)


@pytest.mark.parametrize(("action", "status"), [(None, 404), ("accept", 200), ("decline", 404)])
def test_ticket_image_is_served_only_for_accepted_applications(reviewing, client, staff_client, action, status):
    apply(client)
    if action:
        decide(staff_client, action, 1)
    assert client.get(f"/ticket/{row(reviewing)['ticket_token']}.png").status_code == status


def test_ticket_image_stops_after_an_accepted_application_is_declined(reviewing, client, staff_client):
    apply(client)
    decide(staff_client, "accept", 1)
    decide(staff_client, "decline", 1)
    assert client.get(f"/ticket/{row(reviewing)['ticket_token']}.png").status_code == 404


def test_accepting_records_who_and_when_and_emails_the_ticket(applicants, staff, staff_client, fake_smtp, freeze):
    freeze("2026-11-20T02:00:00")
    html = decide(staff_client, "accept", 2).get_data(as_text=True)
    accepted = row(applicants, 2)
    assert (accepted["state"], accepted["decided_by_id"]) == ("accepted", staff["id"])
    assert accepted["decided_at"] == "2026-11-20T02:00:00+00:00"
    assert (accepted["email_status"], accepted["email_sent_at"]) == ("sent", "2026-11-20T02:00:00+00:00")
    assert recipients(fake_smtp) == ["person2@example.com"]
    assert [application["state"] for application in rows(applicants)] == ["pending", "accepted", "pending"]
    assert "1 accepted." in html
    assert "1 email sent." in html
    assert "Sam Staff &middot; Nov 20, 2026 10:00 AM" in html


def test_acceptance_email_is_the_ticket_email_with_accepted_wording(applicants, staff_client, fake_smtp):
    decide(staff_client, "accept", 1)
    message = messages_to(fake_smtp, "person1@example.com")[0]
    html = message.get_body(("html",)).get_content()
    text = message.get_body(("plain",)).get_content()
    status_link = f"http://localhost:5000/application/{row(applicants)['status_token']}"
    assert message["Subject"] == "You are accepted: Test Seminar"
    assert "Your application was accepted." in html
    assert "Your application was accepted." in text
    assert status_link in html
    assert status_link in text
    assert len([part for part in message.walk() if part.get("Content-ID")]) == 1
    assert [part.get_filename() for part in message.iter_attachments()] == ["SEM-2026-0001.png"]


def test_decline_email_is_short_and_has_no_qr(applicants, staff_client, fake_smtp):
    decide(staff_client, "decline", 1)
    message = messages_to(fake_smtp, "person1@example.com")[0]
    html = message.get_body(("html",)).get_content()
    text = message.get_body(("plain",)).get_content()
    status_link = f"http://localhost:5000/application/{row(applicants)['status_token']}"
    assert message["Subject"] == "Your application: Test Seminar"
    for body in (html, text):
        assert "Hi Person 1" in body
        assert "could not offer you a place" in body
        assert status_link in body
        assert row(applicants)["ticket_token"] not in body
    assert "background:#9c1b1c" in html
    assert "cid:" not in html
    assert list(message.iter_attachments()) == []
    assert not any(part.get_content_maintype() == "image" for part in message.walk())


def test_declining_records_who_decided(applicants, staff, staff_client):
    html = decide(staff_client, "decline", 3).get_data(as_text=True)
    declined = row(applicants, 3)
    assert (declined["state"], declined["decided_by_id"]) == ("declined", staff["id"])
    assert "1 declined." in html


def test_a_declined_application_can_be_accepted_later(applicants, staff_client, fake_smtp):
    decide(staff_client, "decline", 1)
    decide(staff_client, "accept", 1)
    subjects = [message["Subject"] for message in messages_to(fake_smtp, "person1@example.com")]
    assert subjects == ["Your application: Test Seminar", "You are accepted: Test Seminar"]
    assert (row(applicants)["state"], row(applicants)["email_status"]) == ("accepted", "sent")
    assert staff_client.get(f"/checkin/{row(applicants)['ticket_token']}").status_code == 200
    assert row(applicants)["checked_in"] == 1


def test_an_accepted_application_can_be_declined_later(applicants, staff_client, fake_smtp):
    decide(staff_client, "accept", 1)
    decide(staff_client, "decline", 1)
    subjects = [message["Subject"] for message in messages_to(fake_smtp, "person1@example.com")]
    assert subjects == ["You are accepted: Test Seminar", "Your application: Test Seminar"]
    response = staff_client.get(f"/checkin/{row(applicants)['ticket_token']}")
    assert response.status_code == 403
    assert row(applicants)["checked_in"] == 0


def test_someone_already_checked_in_cannot_be_declined(applicants, staff_client, fake_smtp):
    decide(staff_client, "accept", 1, 2)
    staff_client.get(f"/checkin/{row(applicants)['ticket_token']}")
    html = decide(staff_client, "decline", 1, 2).get_data(as_text=True)
    assert [application["state"] for application in rows(applicants)[:2]] == ["accepted", "declined"]
    assert row(applicants)["checked_in"] == 1
    assert "1 declined." in html
    assert "1 left as they were" in html
    assert len(messages_to(fake_smtp, "person1@example.com")) == 1


def test_checked_in_rows_offer_no_decline_button(applicants, staff_client):
    decide(staff_client, "accept", 1)
    assert 'value="decline" class="btn btn-glass btn-small">Decline</button>' in staff_client.get(
        "/admin?state=accepted"
    ).get_data(as_text=True)
    staff_client.get(f"/checkin/{row(applicants)['ticket_token']}")
    assert ">Decline</button>" not in staff_client.get("/admin?state=accepted").get_data(as_text=True)


def test_deciding_the_same_way_twice_changes_and_sends_nothing(applicants, owner, sign_in, staff_client, fake_smtp):
    decide(staff_client, "accept", 1)
    first = row(applicants)
    html = decide(sign_in(owner), "accept", 1).get_data(as_text=True)
    assert "0 accepted." in html
    assert row(applicants) == first
    assert recipients(fake_smtp) == ["person1@example.com"]


def test_bulk_accept_decides_only_the_ticked_people(applicants, staff_client, fake_smtp):
    decide(staff_client, "accept", 1, 3)
    assert [application["state"] for application in rows(applicants)] == ["accepted", "pending", "accepted"]
    assert len(fake_smtp.instances) == 1
    assert recipients(fake_smtp) == ["person1@example.com", "person3@example.com"]


def test_bulk_decline_decides_only_the_ticked_people(applicants, staff_client, fake_smtp):
    decide(staff_client, "decline", 2, 3)
    assert [application["state"] for application in rows(applicants)] == ["pending", "declined", "declined"]
    assert recipients(fake_smtp) == ["person2@example.com", "person3@example.com"]


@pytest.mark.parametrize(("action", "state"), [("accept-pending", "accepted"), ("decline-pending", "declined")])
def test_deciding_all_pending_leaves_earlier_decisions_alone(applicants, staff_client, fake_smtp, action, state):
    decide(staff_client, "decline" if state == "accepted" else "accept", 1)
    earlier = row(applicants)
    staff_client.post(DECIDE, data={"action": action})
    assert row(applicants) == earlier
    assert [application["state"] for application in rows(applicants)[1:]] == [state, state]
    assert recipients(fake_smtp)[1:] == ["person2@example.com", "person3@example.com"]


def test_bulk_decision_without_a_selection_changes_nothing(applicants, staff_client):
    html = staff_client.post(DECIDE, data={"action": "accept"}, follow_redirects=True).get_data(as_text=True)
    assert "Tick at least one person first." in html
    assert {application["state"] for application in rows(applicants)} == {"pending"}


def test_unknown_decision_is_rejected(applicants, staff_client):
    assert staff_client.post(DECIDE, data={"action": "promote", "ids": "1"}).status_code == 400
    assert staff_client.post(DECIDE, data={"ids": "1"}).status_code == 400


def test_deciding_ignores_people_from_another_event(applicants, staff_client):
    staff_client.post("/admin/events", data={"name": "Other Talk", "event_date": "2026-12-05", "venue": "Hall"})
    html = staff_client.post(
        "/admin/events/other-talk/decide", data={"action": "accept", "ids": "1"}, follow_redirects=True
    ).get_data(as_text=True)
    assert "0 accepted." in html
    assert row(applicants)["state"] == "pending"


@pytest.mark.parametrize("path", [DECIDE, SEND])
def test_review_actions_need_a_staff_login(applicants, client, path):
    response = client.post(path, data={"action": "accept-pending"})
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/staff/login")
    assert {application["state"] for application in rows(applicants)} == {"pending"}


def test_review_actions_are_404_for_an_unknown_event(staff_client):
    assert staff_client.post("/admin/events/nope/decide", data={"action": "accept-pending"}).status_code == 404
    assert staff_client.post("/admin/events/nope/emails").status_code == 404


def test_dashboard_counts_each_state(applicants, staff_client):
    decide(staff_client, "accept", 1)
    decide(staff_client, "decline", 2)
    html = staff_client.get("/admin").get_data(as_text=True)
    for state in ("pending", "accepted", "declined"):
        assert f'<span id="count-{state}">1</span>' in html
    assert "All &middot; 3" in html
    assert "Accept all 1 pending" in html


@pytest.mark.parametrize(
    ("state", "shown"),
    [("pending", "person3"), ("accepted", "person1"), ("declined", "person2")],
)
def test_dashboard_filters_by_state(applicants, staff_client, state, shown):
    decide(staff_client, "accept", 1)
    decide(staff_client, "decline", 2)
    html = staff_client.get(f"/admin?state={state}").get_data(as_text=True)
    for number in (1, 2, 3):
        assert (f"person{number}@example.com" in html) == (f"person{number}" == shown)


def test_dashboard_combines_the_state_filter_with_search(applicants, staff_client):
    html = staff_client.get("/admin?state=pending&q=person2").get_data(as_text=True)
    assert "person2@example.com" in html
    assert "person1@example.com" not in html
    assert "No declined applications." in staff_client.get("/admin?state=declined").get_data(as_text=True)


def test_dashboard_ignores_an_unknown_state_filter(applicants, staff_client):
    html = staff_client.get("/admin?state=maybe").get_data(as_text=True)
    assert "person1@example.com" in html


def test_decisions_return_to_the_same_filter_and_search(applicants, staff_client):
    response = staff_client.post(DECIDE, data={"action": "accept", "ids": "1", "state": "pending", "q": "person"})
    assert response.headers["Location"] == "/admin?event=test-seminar&q=person&state=pending"


def test_bulk_selection_works_without_javascript(applicants, staff_client):
    html = staff_client.get("/admin").get_data(as_text=True)
    assert '<form id="bulk" method="post" action="/admin/events/test-seminar/decide"' in html
    assert html.count('type="hidden" name="ids"') == 6
    assert html.count('type="checkbox" name="ids"') == 3
    assert html.count('form="bulk"') == 3
    assert 'id="select-all" aria-label="Select everyone in this list" hidden>' in html
    assert "<script>" not in html
    assert "style=" not in html
    assert 'src="/static/js/review.js"' in html


def test_pending_rows_have_no_check_in_or_resend_button(applicants, staff_client):
    html = staff_client.get("/admin").get_data(as_text=True)
    assert "Check in</button>" not in html
    assert "Resend email</button>" not in html


def test_csv_export_has_state_and_who_decided(applicants, staff_client, freeze):
    freeze("2026-11-20T02:00:00")
    decide(staff_client, "accept", 1)
    decide(staff_client, "decline", 2)
    exported = list(csv.DictReader(io.StringIO(staff_client.get("/admin/export.csv").get_data(as_text=True))))
    assert [line["state"] for line in exported] == ["accepted", "declined", "pending"]
    assert [line["decided_by"] for line in exported] == ["Sam Staff", "Sam Staff", ""]
    assert [line["decided_at"] for line in exported] == ["Nov 20, 2026 10:00 AM", "Nov 20, 2026 10:00 AM", ""]
    assert "status_token" not in exported[0]


def test_csv_export_neutralizes_a_formula_in_the_deciders_name(applicants, make_account, sign_in):
    decide(sign_in(make_account("tricky@example.com", name="=cmd")), "accept", 1)
    exported = list(csv.DictReader(io.StringIO(sign_in(make_account("x@example.com")).get("/admin/export.csv").get_data(as_text=True))))
    assert exported[0]["decided_by"] == "'=cmd"


def test_accepting_many_uses_one_connection_and_leaves_the_rest_waiting(
    reviewing, client, staff_client, fake_smtp, small_batches
):
    for number in range(1, 8):
        apply(client, number)
    html = staff_client.post(DECIDE, data={"action": "accept-pending"}, follow_redirects=True).get_data(as_text=True)
    assert {application["state"] for application in rows(reviewing)} == {"accepted"}
    assert len(fake_smtp.instances) == 1
    assert recipients(fake_smtp) == [f"person{number}@example.com" for number in (1, 2, 3)]
    assert [application["email_status"] for application in rows(reviewing)] == ["sent"] * 3 + ["pending"] * 4
    assert "7 accepted." in html
    assert "3 emails sent." in html
    assert '<b id="emails-waiting">4</b> waiting, <b id="emails-failed">0</b> failed' in html
    assert "Send next batch</button>" in html
    assert "Retry failed</button>" not in html


def test_send_next_batch_works_through_the_waiting_emails(reviewing, client, staff_client, fake_smtp, small_batches):
    for number in range(1, 8):
        apply(client, number)
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    staff_client.post(SEND, data={"which": "waiting"})
    assert [len(smtp.sent) for smtp in fake_smtp.instances] == [3, 3]
    html = staff_client.post(SEND, data={"which": "waiting"}, follow_redirects=True).get_data(as_text=True)
    assert [len(smtp.sent) for smtp in fake_smtp.instances] == [3, 3, 1]
    assert sorted(recipients(fake_smtp)) == [f"person{number}@example.com" for number in range(1, 8)]
    assert "1 email sent." in html
    assert 'id="email-queue"' not in html

    html = staff_client.post(SEND, data={"which": "waiting"}, follow_redirects=True).get_data(as_text=True)
    assert "There was nothing to send." in html
    assert len(recipients(fake_smtp)) == 7


def test_one_failed_recipient_does_not_stop_the_batch_or_lose_the_decision(
    applicants, staff_client, fake_smtp, monkeypatch, caplog
):
    plain_send = fake_smtp.send_message

    def refuse_person_two(smtp, message):
        if message["To"] == "person2@example.com":
            raise OSError("mailbox unavailable")
        plain_send(smtp, message)

    monkeypatch.setattr(fake_smtp, "send_message", refuse_person_two)
    html = staff_client.post(DECIDE, data={"action": "accept-pending"}, follow_redirects=True).get_data(as_text=True)
    assert recipients(fake_smtp) == ["person1@example.com", "person3@example.com"]
    assert [application["state"] for application in rows(applicants)] == ["accepted"] * 3
    assert [application["email_status"] for application in rows(applicants)] == ["sent", "failed", "sent"]
    assert "2 emails sent." in html
    assert "1 could not be emailed." in html
    assert '<b id="emails-failed">1</b> failed' in html
    assert "Sending the ticket failed for SEM-2026-0002" in caplog.text

    monkeypatch.setattr(fake_smtp, "send_message", plain_send)
    staff_client.post(SEND, data={"which": "failed"})
    assert recipients(fake_smtp) == ["person1@example.com", "person3@example.com", "person2@example.com"]
    assert row(applicants, 2)["email_status"] == "sent"


def test_a_failed_connection_keeps_every_decision_and_marks_the_batch_failed(
    applicants, staff_client, fake_smtp, monkeypatch
):
    def refuse_login(_smtp, _user, _password):
        raise OSError("connection refused")

    monkeypatch.setattr(fake_smtp, "login", refuse_login)
    staff_client.post(DECIDE, data={"action": "decline-pending"})
    assert [application["state"] for application in rows(applicants)] == ["declined"] * 3
    assert [application["email_status"] for application in rows(applicants)] == ["failed"] * 3
    assert len(fake_smtp.instances) == 1
    assert recipients(fake_smtp) == []


def test_retry_failed_does_not_resend_what_was_already_sent(applicants, staff_client, fake_smtp):
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    update_rows(applicants, "email_status = 'failed' WHERE id = 2")
    staff_client.post(SEND, data={"which": "failed"})
    staff_client.post(SEND, data={"which": "failed"})
    staff_client.post(SEND, data={"which": "waiting"})
    assert recipients(fake_smtp).count("person2@example.com") == 2
    assert recipients(fake_smtp).count("person1@example.com") == 1
    assert len(recipients(fake_smtp)) == 4


def test_a_batch_claims_its_emails_so_a_second_batch_gets_none(applicants, staff_client):
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    with applicants.app_context():
        event_id = get_event_by_slug("test-seminar")["id"]
        first = delivery.claimed_attendees(delivery.claim_emails(event_id, "waiting", None))
        second = delivery.claimed_attendees(delivery.claim_emails(event_id, "waiting", None))
        retried = delivery.claimed_attendees(delivery.claim_emails(event_id, "failed", None))
        resent = delivery.claimed_attendees(delivery.claim_emails(event_id, "any", [1]))
    assert [attendee["id"] for attendee in first] == [1, 2, 3]
    assert (second, retried, resent) == ([], [], [])


def test_two_staff_clicking_at_once_send_each_email_once(applicants, owner, sign_in, staff_client, fake_smtp, monkeypatch):
    other_staff = sign_in(owner)
    plain_send = fake_smtp.send_message
    clicks = []

    def send_while_the_other_person_clicks(smtp, message):
        if not clicks:
            clicks.append(other_staff.post(DECIDE, data={"action": "accept-pending"}))
            clicks.append(other_staff.post(SEND, data={"which": "waiting"}))
            clicks.append(other_staff.post(SEND, data={"which": "failed"}))
            clicks.append(other_staff.post("/admin/resend/2"))
        plain_send(smtp, message)

    monkeypatch.setattr(fake_smtp, "send_message", send_while_the_other_person_clicks)
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    assert [click.status_code for click in clicks] == [302] * 4
    assert sorted(recipients(fake_smtp)) == [f"person{number}@example.com" for number in (1, 2, 3)]
    assert len(fake_smtp.instances) == 1
    assert [application["email_status"] for application in rows(applicants)] == ["sent"] * 3


def test_changing_a_decision_before_its_email_went_out_sends_only_the_new_one(
    applicants, staff_client, fake_smtp, monkeypatch
):
    plain_login = fake_smtp.login

    def refuse_login(_smtp, _user, _password):
        raise OSError("connection refused")

    monkeypatch.setattr(fake_smtp, "login", refuse_login)
    decide(staff_client, "accept", 1)
    monkeypatch.setattr(fake_smtp, "login", plain_login)
    decide(staff_client, "decline", 1)
    staff_client.post(SEND, data={"which": "failed"})
    staff_client.post(SEND, data={"which": "waiting"})
    subjects = [message["Subject"] for message in messages_to(fake_smtp, "person1@example.com")]
    assert subjects == ["Your application: Test Seminar"]
    assert (row(applicants)["state"], row(applicants)["email_status"]) == ("declined", "sent")


def test_a_waiting_email_follows_the_latest_decision(reviewing, client, staff_client, fake_smtp, small_batches):
    for number in range(1, 6):
        apply(client, number)
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    assert row(reviewing, 5)["email_status"] == "pending"
    decide(staff_client, "decline", 5)
    staff_client.post(SEND, data={"which": "waiting"})
    subjects = [message["Subject"] for message in messages_to(fake_smtp, "person5@example.com")]
    assert subjects == ["Your application: Test Seminar"]


def test_a_decision_changed_during_a_batch_drops_the_stale_email(
    applicants, owner, sign_in, staff_client, fake_smtp, monkeypatch
):
    other_staff = sign_in(owner)
    plain_send = fake_smtp.send_message
    changed = []

    def send_while_the_other_person_declines(smtp, message):
        if not changed:
            changed.append(other_staff.post(DECIDE, data={"action": "decline", "ids": "2"}))
        plain_send(smtp, message)

    monkeypatch.setattr(fake_smtp, "send_message", send_while_the_other_person_declines)
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    subjects = [message["Subject"] for message in messages_to(fake_smtp, "person2@example.com")]
    assert subjects == ["Your application: Test Seminar"]
    assert (row(applicants, 2)["state"], row(applicants, 2)["email_status"]) == ("declined", "sent")
    assert len(recipients(fake_smtp)) == 3


def test_an_interrupted_send_is_never_resent_automatically(applicants, staff_client, fake_smtp, pass_time):
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    with applicants.app_context():
        delivery.claim_emails(get_event_by_slug("test-seminar")["id"], "any", [1])
    sent_before = len(recipients(fake_smtp))

    pass_time(minutes=9)
    staff_client.post(SEND, data={"which": "waiting"})
    staff_client.post(SEND, data={"which": "failed"})
    assert len(recipients(fake_smtp)) == sent_before
    assert '<b id="emails-failed">0</b>' not in staff_client.get("/admin").get_data(as_text=True)

    pass_time(minutes=2)
    assert '<b id="emails-failed">1</b> failed' in staff_client.get("/admin").get_data(as_text=True)
    staff_client.post(SEND, data={"which": "waiting"})
    assert len(recipients(fake_smtp)) == sent_before
    staff_client.post(SEND, data={"which": "failed"})
    assert recipients(fake_smtp)[sent_before:] == ["person1@example.com"]
    assert row(applicants)["email_status"] == "sent"


def test_a_batch_that_runs_out_of_time_leaves_the_rest_waiting(applicants, staff_client, fake_smtp, monkeypatch):
    seconds = iter([0, 1, delivery.EMAIL_BATCH_SECONDS + 1])
    monkeypatch.setattr(delivery, "stopwatch", lambda: next(seconds))
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    assert recipients(fake_smtp) == ["person1@example.com"]
    assert [application["email_status"] for application in rows(applicants)] == ["sent", "pending", "pending"]
    assert [application["email_claim"] for application in rows(applicants)][1:] == [None, None]


def test_with_mail_off_decisions_are_kept_and_emails_stay_waiting(applicants, staff_client, caplog):
    with caplog.at_level("INFO"):
        html = staff_client.post(DECIDE, data={"action": "accept-pending"}, follow_redirects=True).get_data(as_text=True)
    assert [application["email_status"] for application in rows(applicants)] == ["pending"] * 3
    assert "MAIL_ENABLED is off, so the email was logged instead of sent." in html
    assert "To: person1@example.com | Subject: You are accepted: Test Seminar" in caplog.text


def test_logs_never_hold_the_status_link_or_the_email_body(applicants, staff_client, fake_smtp, caplog):
    with caplog.at_level("INFO"):
        decide(staff_client, "accept", 1)
        applicants.config["MAIL_ENABLED"] = False
        decide(staff_client, "decline", 2)
    assert "Subject: Your application: Test Seminar" in caplog.text
    for application in rows(applicants):
        assert application["status_token"] not in caplog.text
        assert application["ticket_token"] not in caplog.text
    assert "could not offer you a place" not in caplog.text
    assert "/application/" not in caplog.text


def test_resending_a_decline_email(applicants, staff_client, fake_smtp):
    decide(staff_client, "decline", 1)
    html = staff_client.post("/admin/resend/1", follow_redirects=True).get_data(as_text=True)
    assert "Decline email for SEM-2026-0001 sent to person1@example.com." in html
    subjects = [message["Subject"] for message in messages_to(fake_smtp, "person1@example.com")]
    assert subjects == ["Your application: Test Seminar"] * 2


def test_resend_refuses_an_application_without_a_decision(applicants, staff_client, fake_smtp):
    html = staff_client.post("/admin/resend/1", follow_redirects=True).get_data(as_text=True)
    assert "Nothing was sent for SEM-2026-0001" in html
    assert fake_smtp.instances == []
    result = applicants.test_cli_runner().invoke(args=["resend-ticket", "--code", "SEM-2026-0001"])
    assert result.exit_code != 0
    assert "has no decision yet" in result.output
    assert fake_smtp.instances == []


@pytest.mark.parametrize("action", [None, "decline"])
def test_ticket_link_refuses_an_application_that_is_not_accepted(applicants, staff_client, action):
    if action:
        decide(staff_client, action, 1)
    response = staff_client.get(f"/checkin/{row(applicants)['ticket_token']}")
    html = response.get_data(as_text=True)
    assert response.status_code == 403
    assert '<body class="result-page status-not_accepted">' in html
    assert "NOT ACCEPTED: Person 1 (SEM-2026-0001)" in html
    assert "INVALID TICKET" not in html
    assert "ALREADY CHECKED IN" not in html
    assert ("declined" if action else "under review") in html
    assert row(applicants)["checked_in"] == 0


@pytest.mark.parametrize(("action", "state"), [(None, "pending"), ("decline", "declined")])
def test_scanner_api_refuses_an_application_that_is_not_accepted(applicants, staff_client, action, state):
    if action:
        decide(staff_client, action, 1)
    response = staff_client.post("/api/checkin", json={"code": row(applicants)["ticket_token"]})
    reply = response.get_json()
    assert response.status_code == 200
    assert (reply["status"], reply["state"]) == ("not_accepted", state)
    assert (reply["name"], reply["code"]) == ("Person 1", "SEM-2026-0001")
    assert row(applicants)["checked_in"] == 0
    assert staff_client.post("/api/checkin", json={"code": "nope"}).get_json() == {"status": "invalid"}


@pytest.mark.parametrize("action", [None, "decline"])
def test_dashboard_check_in_refuses_an_application_that_is_not_accepted(applicants, staff_client, action):
    if action:
        decide(staff_client, action, 1)
    html = staff_client.post("/admin/checkin/1", follow_redirects=True).get_data(as_text=True)
    assert "SEM-2026-0001 is not accepted, so it cannot be checked in." in html
    assert row(applicants)["checked_in"] == 0


def test_accepted_application_checks_in_on_every_path(applicants, staff_client):
    staff_client.post(DECIDE, data={"action": "accept-pending"})
    assert staff_client.get(f"/checkin/{row(applicants, 1)['ticket_token']}").status_code == 200
    reply = staff_client.post("/api/checkin", json={"code": row(applicants, 2)["ticket_token"]}).get_json()
    assert (reply["status"], reply["state"]) == ("checked_in", "accepted")
    staff_client.post("/admin/checkin/3")
    assert [application["checked_in"] for application in rows(applicants)] == [1, 1, 1]


def test_scanner_script_knows_the_not_accepted_result(client):
    script = client.get("/static/js/scanner.js").get_data(as_text=True)
    assert 'not_accepted: "NOT ACCEPTED"' in script
    assert "not_accepted: { hz: 300, seconds: 0.12, times: 3 }" in script
    stylesheet = client.get("/static/css/style.css").get_data(as_text=True)
    assert ".status-not_accepted { background: var(--ink); }" in stylesheet


EVENT_FORM = {"name": "Other Talk", "event_date": "2026-12-05", "venue": "Hall"}


def review_flag(app, slug):
    with app.app_context():
        return get_event_by_slug(slug)["review_applications"]


def test_new_events_review_applications_by_default(app, staff_client):
    staff_client.post("/admin/events", data=EVENT_FORM)
    assert review_flag(app, "other-talk") == 1
    html = staff_client.get("/admin?event=other-talk").get_data(as_text=True)
    assert "Applications wait here until you decide." in html
    assert '<option value="review">Review applications</option>' in html


def test_a_new_event_can_accept_everyone_automatically(app, staff_client, client):
    staff_client.post("/admin/events", data={**EVENT_FORM, "applications": "automatic"})
    assert review_flag(app, "other-talk") == 0
    client.post("/events/other-talk/register", data=person(1))
    assert row(app)["state"] == "accepted"


def test_the_first_event_and_command_line_events_review_by_default(make_app):
    app = make_app({"EVENT_NAME": "First", "EVENT_DATE": "2026-11-30", "EVENT_VENUE": "Hall", "TODAY": "2026-11-01"})
    runner = app.test_cli_runner()
    runner.invoke(args=["add-event", "--name", "Second", "--date", "2026-12-01", "--venue", "Hall"])
    runner.invoke(args=["add-event", "--name", "Third", "--date", "2026-12-02", "--venue", "Hall", "--accept-everyone"])
    assert [review_flag(app, slug) for slug in ("first", "second", "third")] == [1, 1, 0]


def test_edit_page_shows_and_changes_the_mode(app, staff_client):
    html = staff_client.get("/admin/events/test-seminar/edit").get_data(as_text=True)
    assert '<option value="automatic" selected>' in html
    form = {"name": "Test Seminar", "event_date": "2026-11-30", "venue": "Main Hall"}
    staff_client.post("/admin/events/test-seminar/edit", data={**form, "applications": "review"})
    assert review_flag(app, "test-seminar") == 1
    assert '<option value="review" selected>' in staff_client.get("/admin/events/test-seminar/edit").get_data(as_text=True)
    staff_client.post("/admin/events/test-seminar/edit", data={**form, "applications": "automatic"})
    assert review_flag(app, "test-seminar") == 0


def test_edit_page_keeps_the_chosen_mode_when_the_form_has_errors(reviewing, staff_client):
    response = staff_client.post("/admin/events/test-seminar/edit", data={"name": "", "applications": "automatic"})
    assert response.status_code == 400
    assert '<option value="automatic" selected>' in response.get_data(as_text=True)
    assert review_flag(reviewing, "test-seminar") == 1


def test_switching_to_automatic_keeps_decisions_and_leaves_pending_applications_pending(
    applicants, staff_client, client, fake_smtp
):
    decide(staff_client, "accept", 1)
    decide(staff_client, "decline", 2)
    before = rows(applicants)
    sent_before = recipients(fake_smtp)
    form = {"name": "Test Seminar", "event_date": "2026-11-30", "venue": "Main Hall", "applications": "automatic"}
    staff_client.post("/admin/events/test-seminar/edit", data=form)
    assert rows(applicants) == before
    assert recipients(fake_smtp) == sent_before
    assert [application["state"] for application in before] == ["accepted", "declined", "pending"]

    apply(client, 4)
    assert row(applicants, 4)["state"] == "accepted"
    html = staff_client.get("/admin").get_data(as_text=True)
    assert "Accept all 1 pending" in html
    decide(staff_client, "accept", 3)
    assert row(applicants, 3)["state"] == "accepted"


def test_switching_to_review_keeps_existing_tickets_working(app, client, staff_client):
    client.post("/events/test-seminar/register", data=person(1))
    before = rows(app)
    form = {"name": "Test Seminar", "event_date": "2026-11-30", "venue": "Main Hall", "applications": "review"}
    staff_client.post("/admin/events/test-seminar/edit", data=form)
    assert rows(app) == before
    assert staff_client.get(f"/checkin/{row(app)['ticket_token']}").status_code == 200
    apply(client, 2)
    assert row(app, 2)["state"] == "pending"


def lock_wait_seen(watcher):
    return any(watcher.execute("SELECT 1 FROM pg_locks WHERE NOT granted").fetchone() for _ in range(100000))


def test_a_claim_that_waited_behind_another_claim_takes_nothing(applicants, staff_client):
    url = applicants.config["DATABASE_URL"]
    if not url:
        pytest.skip("sqlite lets one connection write at a time, so claims cannot overlap")
    staff_client.post(DECIDE, data={"action": "accept-pending"})

    def claim_from_another_request():
        with applicants.app_context():
            claim = delivery.claim_emails(get_event_by_slug("test-seminar")["id"], "waiting", None)
            return delivery.claimed_attendees(claim)

    with psycopg.connect(url) as first, psycopg.connect(url, autocommit=True) as watcher:
        first.execute(
            "UPDATE attendees SET email_status = 'sending', email_claim = 'first' WHERE email_status = 'pending'"
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            second = pool.submit(claim_from_another_request)
            blocked = lock_wait_seen(watcher)
            first.commit()
            assert blocked
            assert second.result(timeout=30) == []
    assert {application["email_claim"] for application in rows(applicants)} == {"first"}


def test_a_decision_that_waited_behind_the_same_decision_changes_nothing(applicants, staff):
    url = applicants.config["DATABASE_URL"]
    if not url:
        pytest.skip("sqlite lets one connection write at a time, so decisions cannot overlap")

    def decide_from_another_request():
        with applicants.app_context():
            return review.decide(get_event_by_slug("test-seminar")["id"], "accepted", staff["id"])

    with psycopg.connect(url) as first, psycopg.connect(url, autocommit=True) as watcher:
        first.execute("UPDATE attendees SET state = 'accepted', email_status = 'sent'")
        with ThreadPoolExecutor(max_workers=1) as pool:
            second = pool.submit(decide_from_another_request)
            blocked = lock_wait_seen(watcher)
            first.commit()
            assert blocked
            assert second.result(timeout=30) == []
    assert {application["email_status"] for application in rows(applicants)} == {"sent"}
