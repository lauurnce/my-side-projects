from datetime import date
from xml.etree import ElementTree

import pytest

from app.services.events import create_event

SITEMAP_NAMESPACE = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def sitemap_addresses(client):
    response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert response.mimetype == "application/xml"
    tree = ElementTree.fromstring(response.get_data())
    return [loc.text for loc in tree.iter(f"{SITEMAP_NAMESPACE}loc")]


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
    with app.app_context():
        create_event('Talks "<script>"', date(2027, 2, 9), "Hall", review_applications=False)
    html = client.get("/events/talks-script").get_data(as_text=True)
    assert "<script>\"" not in html
    assert "Talks &#34;&lt;script&gt;&#34;" in html


def test_share_preview_has_a_large_image(client):
    html = client.get("/").get_data(as_text=True)
    assert '<meta property="og:image" content="http://localhost:5000/static/share.png">' in html
    assert '<meta name="twitter:card" content="summary_large_image">' in html
    image = client.get("/static/share.png")
    assert image.status_code == 200
    assert image.mimetype == "image/png"


def test_sitemap_lists_the_landing_page_and_open_events(client):
    assert sitemap_addresses(client) == ["http://localhost:5000/", "http://localhost:5000/events/test-seminar"]


def test_sitemap_leaves_out_drafts_and_past_events(app, client):
    with app.app_context():
        create_event("Hidden Draft", date(2027, 2, 9), "Hall", published=False)
        create_event("Long Ago", date(2026, 10, 1), "Hall")
        create_event("Coming Up", date(2027, 3, 1), "Hall")
    addresses = sitemap_addresses(client)
    assert "http://localhost:5000/events/coming-up" in addresses
    assert not any("hidden-draft" in address or "long-ago" in address for address in addresses)


def test_robots_txt_points_to_the_sitemap_and_closes_private_pages(client):
    response = client.get("/robots.txt")
    assert response.mimetype == "text/plain"
    lines = response.get_data(as_text=True).splitlines()
    assert lines[:2] == ["User-agent: *", "Allow: /"]
    assert "Sitemap: http://localhost:5000/sitemap.xml" in lines
    for path in ("/staff/", "/admin", "/scanner", "/checkin/", "/application/", "/registered/", "/ticket/", "/api/"):
        assert f"Disallow: {path}" in lines
