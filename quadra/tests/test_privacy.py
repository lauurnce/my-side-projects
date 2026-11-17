def test_privacy_page_says_what_is_collected_and_why(client):
    response = client.get("/privacy")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    for phrase in (
        "full name, email address, organization and mobile number",
        "To check you in at the door.",
        "Data Privacy Act of 2012",
        "National Privacy Commission",
        "not an official website",
    ):
        assert phrase in html


def test_privacy_page_can_be_indexed(client):
    assert "X-Robots-Tag" not in client.get("/privacy").headers


def test_privacy_page_shows_the_contact_address_when_set(app, client):
    assert "contact the organizers of the event" in client.get("/privacy").get_data(as_text=True)
    app.config["CONTACT_EMAIL"] = "organizers@example.com"
    html = client.get("/privacy").get_data(as_text=True)
    assert "write to <strong>organizers@example.com</strong>" in html


def test_every_page_links_to_the_privacy_notice(client):
    for path in ("/", "/events/test-seminar", "/staff/login"):
        assert 'href="/privacy"' in client.get(path).get_data(as_text=True)


def saved_attendees(app):
    from app.db import get_db

    with app.app_context():
        return get_db().execute("SELECT * FROM attendees ORDER BY id").fetchall()


def test_form_asks_for_agreement_and_links_the_notice(client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert 'id="consent" name="consent" type="checkbox" value="yes" required' in html
    assert '<a href="/privacy">privacy notice</a>' in html


def test_registering_without_agreeing_is_refused(app, client, valid_form):
    del valid_form["consent"]
    response = client.post("/events/test-seminar/register", data=valid_form)
    assert response.status_code == 400
    assert "Tick the box to agree before you continue." in response.get_data(as_text=True)
    assert saved_attendees(app) == []


def test_any_value_other_than_yes_is_not_agreement(app, client, valid_form):
    response = client.post("/events/test-seminar/register", data={**valid_form, "consent": "no"})
    assert response.status_code == 400
    assert saved_attendees(app) == []


def test_agreeing_is_recorded_with_its_time(app, client, valid_form, freeze):
    assert client.post("/events/test-seminar/register", data=valid_form).status_code == 302
    attendee = saved_attendees(app)[0]
    assert attendee["consented_at"] == attendee["created_at"]
    assert attendee["consented_at"].startswith("20")


def test_the_box_stays_ticked_when_another_field_is_wrong(client, valid_form):
    response = client.post("/events/test-seminar/register", data={**valid_form, "contact_number": "123"})
    html = response.get_data(as_text=True)
    assert response.status_code == 400
    assert "checked" in html.split('id="consent"')[1].split(">")[0]
    assert "Tick the box" not in html


def test_the_box_is_not_ticked_on_a_fresh_form(client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert "checked" not in html.split('id="consent"')[1].split(">")[0]


def test_csv_export_shows_when_each_person_agreed(client, valid_form, owner, sign_in):
    import csv
    import io

    client.post("/events/test-seminar/register", data=valid_form)
    staff = sign_in(owner)
    rows = list(csv.DictReader(io.StringIO(staff.get("/admin/export.csv").get_data(as_text=True))))
    assert rows[0]["consented_at"] == rows[0]["created_at"]
    assert rows[0]["consented_at"].endswith(("AM", "PM"))
