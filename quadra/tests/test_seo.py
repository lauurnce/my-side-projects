import pytest


def test_landing_page_has_a_title_and_description(client):
    html = client.get("/").get_data(as_text=True)
    assert "<title>Quadra: seminars and events at PUP</title>" in html
    assert '<meta name="description" content="Register for seminars and events at the Polytechnic' in html


def test_event_page_describes_the_event(client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert "<title>Test Seminar</title>" in html
    assert (
        '<meta name="description" content="Test Seminar on November 30, 2026 at Main Hall.'
        " Register on Quadra and get your QR ticket by email.\">"
    ) in html


@pytest.mark.parametrize("path", ["/", "/events/test-seminar"])
def test_pages_name_their_public_address(client, path):
    html = client.get(path).get_data(as_text=True)
    assert f'<link rel="canonical" href="http://localhost:5000{path}">' in html
    assert f'<meta property="og:url" content="http://localhost:5000{path}">' in html


def test_share_preview_repeats_the_title_and_description(client):
    html = client.get("/events/test-seminar").get_data(as_text=True)
    assert '<meta property="og:title" content="Test Seminar">' in html
    assert '<meta property="og:description" content="Test Seminar on November 30, 2026 at Main Hall.' in html
    assert '<meta property="og:site_name" content="Quadra">' in html


def test_event_names_are_escaped_in_the_page_head(app, client):
    from datetime import date

    from app.services.events import create_event

    with app.app_context():
        create_event('Talks "<script>"', date(2027, 2, 9), "Hall", review_applications=False)
    html = client.get("/events/talks-script").get_data(as_text=True)
    assert "<script>\"" not in html
    assert "Talks &#34;&lt;script&gt;&#34;" in html
