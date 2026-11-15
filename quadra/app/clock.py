import time
from datetime import UTC, datetime, timedelta, timezone

MANILA = timezone(timedelta(hours=8), "PHT")


def utc_now():
    return datetime.now(UTC)


def utc_timestamp(offset=timedelta(0)):
    return (utc_now() + offset).isoformat(timespec="seconds")


def stopwatch():
    return time.monotonic()


def wait(seconds):
    if seconds > 0:
        time.sleep(seconds)


def manila_today():
    return datetime.now(MANILA).date()


def manila_time(stored):
    if not stored:
        return ""
    moment = datetime.fromisoformat(stored)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=MANILA)
    local = moment.astimezone(MANILA)
    return f"{local:%b} {local.day}, {local.year} {local.hour % 12 or 12}:{local:%M} {local:%p}"
