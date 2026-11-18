from . import security

ENVIRONMENTS = ("", "development", "staging", "production")
NO_INDEX = "noindex, nofollow"


def require_one_environment(app):
    config = app.config
    if config["QUADRA_ENV"] not in ENVIRONMENTS:
        raise RuntimeError(
            f"QUADRA_ENV is {config['QUADRA_ENV']!r}. Use production, staging, or leave it empty."
        )
    if config["STAGING"] and config["PRODUCTION"]:
        raise RuntimeError("Staging and production are both switched on. Pick one with QUADRA_ENV.")
    if config["PRODUCTION"] and config["STAGING_MAIL_ALLOWLIST"].strip():
        raise RuntimeError(
            "STAGING_MAIL_ALLOWLIST is set on a production site."
            " Remove it, or set QUADRA_ENV=staging if this is the test copy."
        )


def init_app(app):
    require_one_environment(app)
    if not app.config["STAGING"]:
        return
    security.harden_for_production(app)

    @app.after_request
    def keep_the_test_copy_out_of_search(response):
        response.headers["X-Robots-Tag"] = NO_INDEX
        response.headers["Strict-Transport-Security"] = security.HSTS
        return response
