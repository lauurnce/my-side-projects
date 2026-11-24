import logging
import os

from flask import Flask

from .config import Config


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    app.config["DATABASE"] = os.path.join(app.instance_path, "seminar.db")
    app.config["QR_DIR"] = os.path.join(app.instance_path, "qrcodes")
    if test_config:
        app.config.update(test_config)

    os.makedirs(app.instance_path, exist_ok=True)
    app.logger.setLevel(logging.INFO)

    from . import commands, csrf, db, routes, staff
    from .services import events

    db.init_app(app)
    csrf.init_app(app)
    commands.init_app(app)
    events.init_app(app)
    app.register_blueprint(routes.bp)
    app.register_blueprint(staff.bp)

    return app
