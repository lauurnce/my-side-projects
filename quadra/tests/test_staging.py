import pytest

from app import create_app
from app.config import DEFAULT_SECRET_KEY
from app.security import HSTS
from app.services.registration import create_attendee

SECRET_KEY = "a-long-random-staging-key"
BANNER = "This is not the real Quadra site"
PUBLIC_PAGES = ["/", "/events/test-seminar", "/privacy", "/staff/login", "/staff/forgot", "/no-such-page"]
STAFF_PAGES = ["/admin", "/scanner", "/staff/account", "/admin/events/test-seminar/edit"]
EVERY_KIND_OF_RESPONSE = [*PUBLIC_PAGES, "/health", "/robots.txt", "/sitemap.xml", "/static/css/style.css"]


def start(tmp_path, **settings):
    return create_app({"TESTING": True, "DATABASE": str(tmp_path / "staging.db"), **settings})


@pytest.fixture
def app(make_app):
    return make_app({
        "STAGING": True,
        "SECRET_KEY": SECRET_KEY,
        "PUBLIC_BASE_URL": "http://localhost:5000",
        "CSRF_ENABLED": False,
        "MAIL_ENABLED": False,
        "TODAY": "2026-11-01",
        "EVENT_NAME": "Test Seminar",
        "EVENT_DATE": "November 30, 2026",
        "EVENT_VENUE": "Main Hall",
    })


def ticket_token(app, state="accepted"):
    with app.app_context():
        attendee = create_attendee(1, "Juan Dela Cruz", f"{state}@example.com", "PUP", "+639171234567", state)
    return attendee["ticket_token"]


@pytest.mark.parametrize("path", PUBLIC_PAGES)
def test_staging_shows_the_banner_on_public_pages(client, path):
    assert BANNER in client.get(path).get_data(as_text=True)


@pytest.mark.parametrize("path", STAFF_PAGES)
def test_staging_shows_the_banner_on_staff_pages(staff_client, path):
    response = staff_client.get(path)
    assert response.status_code == 200
    assert BANNER in response.get_data(as_text=True)


def test_staging_shows_the_banner_on_the_team_page(owner_client):
    assert BANNER in owner_client.get("/staff/team").get_data(as_text=True)


def test_staging_shows_the_banner_on_the_ticket_page(client, valid_form):
    page = client.post("/events/test-seminar/register", data=valid_form, follow_redirects=True)
    assert "Application received" in page.get_data(as_text=True)
    assert BANNER in page.get_data(as_text=True)


@pytest.mark.parametrize(
    ("token_of", "status", "headline"),
    [
        (lambda app: ticket_token(app), 200, "CHECKED IN"),
        (lambda app: ticket_token(app, "pending"), 403, "NOT ACCEPTED"),
        (lambda app: "made-up-token", 404, "INVALID TICKET"),
    ],
)
def test_staging_shows_the_banner_on_every_check_in_result(app, staff_client, token_of, status, headline):
    response = staff_client.get(f"/checkin/{token_of(app)}")
    assert response.status_code == status
    assert headline in response.get_data(as_text=True)
    assert BANNER in response.get_data(as_text=True)


def test_staging_banner_says_the_data_may_be_wiped(client):
    assert "all data may be wiped at any time" in client.get("/").get_data(as_text=True)


@pytest.mark.parametrize("path", EVERY_KIND_OF_RESPONSE)
def test_staging_asks_search_engines_to_stay_away_on_every_response(client, path):
    assert client.get(path).headers["X-Robots-Tag"] == "noindex, nofollow"


def test_staging_redirects_and_api_answers_are_not_indexable_either(client):
    assert client.get("/admin").headers["X-Robots-Tag"] == "noindex, nofollow"
    assert client.post("/api/checkin", json={"code": "x"}).headers["X-Robots-Tag"] == "noindex, nofollow"


def test_staging_robots_file_closes_the_whole_site(client):
    response = client.get("/robots.txt")
    assert response.mimetype == "text/plain"
    assert response.get_data(as_text=True).splitlines() == ["User-agent: *", "Disallow: /"]


def test_staging_sitemap_lists_nothing(client):
    body = client.get("/sitemap.xml").get_data(as_text=True)
    assert "<urlset" in body
    assert "<loc>" not in body


def test_staging_is_hardened_like_production(client, staff, sign_in):
    response = client.post("/staff/login", data={"email": staff["email"], "password": staff["password"]})
    cookie = next(value for value in response.headers.getlist("Set-Cookie") if value.startswith("session="))
    assert "Secure" in cookie
    assert response.headers["Strict-Transport-Security"] == HSTS


@pytest.mark.parametrize("secret_key", [DEFAULT_SECRET_KEY, ""])
def test_staging_refuses_a_missing_or_default_secret_key(tmp_path, secret_key):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        start(tmp_path, STAGING=True, SECRET_KEY=secret_key)


def test_staging_and_production_together_refuse_to_start(tmp_path):
    with pytest.raises(RuntimeError, match="Staging and production are both switched on"):
        start(tmp_path, STAGING=True, PRODUCTION=True, SECRET_KEY=SECRET_KEY)


def test_production_with_a_staging_allowlist_refuses_to_start(tmp_path):
    with pytest.raises(RuntimeError, match="STAGING_MAIL_ALLOWLIST is set on a production site"):
        start(tmp_path, PRODUCTION=True, SECRET_KEY=SECRET_KEY, STAGING_MAIL_ALLOWLIST="tester@example.com")


@pytest.mark.parametrize("misspelled", ["stagging", "prod", "live", "staging,production"])
def test_an_unknown_environment_name_refuses_to_start(tmp_path, misspelled):
    with pytest.raises(RuntimeError, match="QUADRA_ENV is"):
        start(tmp_path, QUADRA_ENV=misspelled)


@pytest.mark.parametrize("name", ["", "development", "staging", "production"])
def test_known_environment_names_start(tmp_path, name):
    settings = {"STAGING": name == "staging", "PRODUCTION": name == "production"}
    assert start(tmp_path, QUADRA_ENV=name, SECRET_KEY=SECRET_KEY, **settings)


def test_staging_with_mail_off_issues_no_invite_link(app, owner_client, caplog):
    with caplog.at_level("INFO"):
        page = owner_client.post("/staff/team/invite", data={"email": "new@example.com"}, follow_redirects=True)
    assert "Email is turned off, so the invite could not be sent" in page.get_data(as_text=True)
    assert "set-password" not in caplog.text


class TestWithoutStaging:

    @pytest.fixture
    def app(self, make_app):
        return make_app({
            "PUBLIC_BASE_URL": "http://localhost:5000",
            "CSRF_ENABLED": False,
            "TODAY": "2026-11-01",
            "EVENT_NAME": "Test Seminar",
            "EVENT_DATE": "November 30, 2026",
            "EVENT_VENUE": "Main Hall",
        })

    @pytest.mark.parametrize("path", PUBLIC_PAGES)
    def test_no_banner_on_public_pages(self, client, path):
        assert "staging-banner" not in client.get(path).get_data(as_text=True)

    def test_no_banner_on_staff_pages_or_check_in_results(self, staff_client):
        for path in [*STAFF_PAGES, "/checkin/made-up-token"]:
            assert "staging-banner" not in staff_client.get(path).get_data(as_text=True)

    def test_public_pages_stay_indexable(self, client):
        assert "X-Robots-Tag" not in client.get("/").headers
        assert "Sitemap: http://localhost:5000/sitemap.xml" in client.get("/robots.txt").get_data(as_text=True)
        assert "<loc>http://localhost:5000/</loc>" in client.get("/sitemap.xml").get_data(as_text=True)

    def test_development_sends_no_transport_security_header(self, client):
        assert "Strict-Transport-Security" not in client.get("/").headers
