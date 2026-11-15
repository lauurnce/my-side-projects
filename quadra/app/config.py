import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

DEFAULT_SECRET_KEY = "dev-only-change-me"


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or DEFAULT_SECRET_KEY
    PRODUCTION = os.environ.get("QUADRA_ENV", "").strip().lower() == "production"
    TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS") or 0)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(hours=12)
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:5000")
    MAIL_ENABLED = os.environ.get("MAIL_ENABLED", "false").lower() == "true"
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "")
    MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "Quadra")
    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 465
    MAIL_TIMEOUT = 15
    EVENT_NAME = os.environ.get("EVENT_NAME", "Seminar")
    EVENT_DATE = os.environ.get("EVENT_DATE", "TBA")
    EVENT_VENUE = os.environ.get("EVENT_VENUE", "TBA")
    ATTENDEE_CODE_PREFIX = "SEM-2026"
    DATABASE = None
    DATABASE_URL = os.environ.get("DATABASE_URL") or None
