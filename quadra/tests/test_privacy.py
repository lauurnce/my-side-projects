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
