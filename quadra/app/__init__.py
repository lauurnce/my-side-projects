import logging
import os

from flask import Flask

from .config import Config


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    app.config["DATABASE"] = os.path.join(app.instance_path, "seminar.db")
    if test_config:
        app.config.update(test_config)

    if not app.config["DATABASE_URL"]:
        os.makedirs(app.instance_path, exist_ok=True)
    app.logger.setLevel(logging.INFO)

    from . import accounts, commands, csrf, db, errors, routes, security, staff
    from .services import events

    security.init_app(app)
    errors.init_app(app)
    db.init_app(app)
    csrf.init_app(app)
    commands.init_app(app)
    events.init_app(app)
    app.register_blueprint(routes.bp)
    app.register_blueprint(accounts.bp)
    app.register_blueprint(staff.bp)

    return app
