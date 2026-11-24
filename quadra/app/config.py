import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-change-me"
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:5000")
    MAIL_ENABLED = os.environ.get("MAIL_ENABLED", "false").lower() == "true"
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "")
    MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "Quadra")
    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 465
    MAIL_TIMEOUT = 15
    STAFF_PIN = os.environ.get("STAFF_PIN", "")
    EVENT_NAME = os.environ.get("EVENT_NAME", "Seminar")
    EVENT_DATE = os.environ.get("EVENT_DATE", "TBA")
    EVENT_VENUE = os.environ.get("EVENT_VENUE", "TBA")
    ATTENDEE_CODE_PREFIX = "SEM-2026"
    DATABASE = None
