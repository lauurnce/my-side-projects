import json
import stat
from datetime import date

import click
import pytest

from app import backup as backup_module
from app import create_app
from app.backup import (
    LOAD_ORDER,
    database_name,
    read_backup,
    restore_backup,
    take_backup,
)
from app.db import get_db, init_db, open_postgres
from app.services.accounts import change_password, create_account, issue_link
from app.services.checkin import check_in
from app.services.events import create_event
from app.services.registration import create_attendee, get_attendee_by_code, may_apply

PASSWORD = "correct-horse-battery"
OWNER_EMAIL = "olivia@example.com"
PRODUCTION = {"PRODUCTION": True, "SECRET_KEY": "a-long-random-production-key"}


def fill_every_table(app):
    with app.app_context():
        owner = create_account(OWNER_EMAIL, "owner", "Olivia Owner")
        change_password(owner["id"], PASSWORD)
        issue_link(create_account("invited@example.com", "admin")["id"], "invite")
        event = create_event("Backup Talk", date(2026, 12, 20), "Hall B", review_applications=False)
        first = create_attendee(event["id"], "Juan Dela Cruz", "juan@example.com", "PUP", "+639171234567")
        create_attendee(event["id"], "María Ñ. Santos 🎓", "maria@example.com", "PUP", "+639181234567")
        check_in(first["ticket_token"], owner["id"])
        may_apply("203.0.113.9")
        get_db().execute(
            "INSERT INTO error_alerts (kind, last_sent_at, suppressed)"
            " VALUES ('ValueError on GET /crash', '2026-11-20T02:00:00+00:00', 3)"
        )
        get_db().commit()
        codes = {"checked_in": first["attendee_code"], "waiting": f"SEM-2026-{first['id'] + 1:04d}"}
    app.test_client().post("/staff/login", data={"email": OWNER_EMAIL, "password": "not-the-password"})
    return codes


def backup_of(app):
    with app.app_context():
        return json.loads(json.dumps(take_backup()))


def emptied(app):
    with app.app_context():
        init_db(force=True, seed=False)
    return app


def restore_into(app, backup, force=False):
    with app.app_context():
        return restore_backup(backup, force)


def count(app, table):
    with app.app_context():
        return get_db().execute(f"SELECT COUNT(*) AS total FROM {table}").fetchone()["total"]


def sqlite_app(tmp_path, name):
    config = {"DATABASE": str(tmp_path / name), "DATABASE_URL": None, "MAIL_ENABLED": False, "CSRF_ENABLED": False}
    return emptied(create_app({"TESTING": True, **config}))


def signed_in_owner(app):
    client = app.test_client()
    assert client.post("/staff/login", data={"email": OWNER_EMAIL, "password": PASSWORD}).status_code == 302
    return client


@pytest.fixture
def filled(app):
    return fill_every_table(emptied(app))


def test_backup_holds_rows_from_every_table_and_the_migrations(app, filled):
    backup = backup_of(app)
    assert (backup["format"], backup["version"]) == ("quadra-backup", 1)
    assert backup["source"] == ("postgres" if app.config["DATABASE_URL"] else "sqlite")
    assert backup["migrations"][0] == "0001_initial.sql"
    assert backup["migrations"][-1] == "0007_error_alerts.sql"
    assert set(backup["tables"]) == set(LOAD_ORDER)
    assert all(backup["tables"][table] for table in LOAD_ORDER)
    assert backup["last_ids"] == {"accounts": 2, "events": 1, "attendees": 2}
    assert "María Ñ. Santos 🎓" in {row["full_name"] for row in backup["tables"]["attendees"]}


def test_postgres_backup_is_one_snapshot_even_while_people_register(app, filled, monkeypatch, postgres_url):
    if not postgres_url:
        pytest.skip("sqlite holds writers back while a backup reads")
    real = backup_module.last_issued_id

    def register_someone_meanwhile(db, table):
        other = open_postgres(postgres_url)
        other.execute(
            "INSERT INTO events (slug, name, event_date, venue, created_at)"
            " VALUES (%s, 'Late Event', '2026-12-25', 'Hall', '2026-11-20T02:00:00+00:00')",
            (f"late-{table}",),
        )
        other.commit()
        other.close()
        return real(db, table)

    monkeypatch.setattr(backup_module, "last_issued_id", register_someone_meanwhile)
    backup = backup_of(app)
    assert [event["slug"] for event in backup["tables"]["events"]] == ["backup-talk"]
    assert count(app, "events") == 4


def test_round_trip_brings_every_row_back(app, filled):
    before = backup_of(app)
    emptied(app)
    assert restore_into(app, before) == sum(len(rows) for rows in before["tables"].values())
    after = backup_of(app)
    assert after["tables"] == before["tables"]
    assert after["last_ids"] == before["last_ids"]
    assert after["migrations"] == before["migrations"]


def test_restored_ticket_still_checks_in_and_the_owner_still_signs_in(app, filled):
    backup = backup_of(app)
    restore_into(emptied(app), backup)
    client = signed_in_owner(app)
    with app.app_context():
        waiting = get_attendee_by_code(filled["waiting"])
        already = get_attendee_by_code(filled["checked_in"])
    assert (already["checked_in"], already["checked_in_by"]) == (1, "Olivia Owner")
    assert "CHECKED IN" in client.get(f"/checkin/{waiting['ticket_token']}").get_data(as_text=True).upper()
    with app.app_context():
        assert get_attendee_by_code(filled["waiting"])["checked_in"] == 1
    assert client.get(f"/application/{waiting['status_token']}").status_code == 200
    assert client.get(f"/ticket/{waiting['ticket_token']}.png").mimetype == "image/png"
    assert "Backup Talk" in client.get("/admin").get_data(as_text=True)


def test_new_rows_after_a_restore_get_fresh_ids(app, filled):
    with app.app_context():
        get_db().execute("DELETE FROM attendees WHERE email = 'maria@example.com'")
        get_db().commit()
    backup = backup_of(app)
    assert backup["last_ids"]["attendees"] == 2
    restore_into(emptied(app), backup)
    with app.app_context():
        event = create_event("After Restore", date(2026, 12, 21), "Hall C")
        attendee = create_attendee(1, "Pedro Penduko", "pedro@example.com", "PUP", "+639191234567")
        account = create_account("later@example.com", "admin")
    assert (event["id"], attendee["id"], account["id"]) == (2, 3, 3)
    assert attendee["attendee_code"] == "SEM-2026-0003"


def test_restore_refuses_a_database_that_has_rows(app, filled):
    backup = backup_of(app)
    with app.app_context(), pytest.raises(click.ClickException) as refusal:
        restore_backup(backup)
    assert "already has rows in" in refusal.value.message
    assert "--force" in refusal.value.message
    assert backup_of(app)["tables"] == backup["tables"]


def test_restore_refuses_different_migrations(app, filled):
    backup = backup_of(app)
    backup["migrations"] = backup["migrations"][:-1]
    with emptied(app).app_context(), pytest.raises(click.ClickException) as refusal:
        restore_backup(backup)
    assert "different migrations" in refusal.value.message
    assert count(app, "attendees") == 0


def test_force_replaces_the_rows_that_were_there(app, filled):
    backup = backup_of(app)
    with app.app_context():
        create_attendee(1, "Late Comer", "late@example.com", "PUP", "+639201234567")
    backup["migrations"] = backup["migrations"][:-1]
    restore_into(app, backup, force=True)
    assert backup_of(app)["tables"] == backup["tables"]


def test_failed_restore_changes_nothing(app, filled):
    before = backup_of(app)
    broken = json.loads(json.dumps(before))
    broken["tables"]["attendees"].append(dict(broken["tables"]["attendees"][-1]))
    with app.app_context(), pytest.raises(click.ClickException) as failure:
        restore_backup(broken, force=True)
    assert "nothing was changed" in failure.value.message
    assert backup_of(app)["tables"] == before["tables"]


def test_rows_with_unknown_columns_are_refused_and_nothing_changes(app, filled):
    before = backup_of(app)
    odd = json.loads(json.dumps(before))
    odd["tables"]["attendees"][0]["shoe_size"] = 42
    with app.app_context(), pytest.raises(click.ClickException) as failure:
        restore_backup(odd, force=True)
    assert "do not fit" in failure.value.message
    assert backup_of(app)["tables"] == before["tables"]


@pytest.mark.parametrize(
    "content",
    ["not json", "[]", '{"format": "something-else"}', '{"format": "quadra-backup", "version": 2, "migrations": [], "tables": {}}'],
)
def test_files_that_are_not_backups_are_refused(tmp_path, content):
    path = tmp_path / "odd.json"
    path.write_text(content)
    with pytest.raises(click.ClickException):
        read_backup(path)


def test_backup_with_an_unknown_table_is_refused(tmp_path):
    path = tmp_path / "odd.json"
    path.write_text(json.dumps({"format": "quadra-backup", "version": 1, "migrations": [], "tables": {"secrets": []}}))
    with pytest.raises(click.ClickException) as refusal:
        read_backup(path)
    assert "secrets" in refusal.value.message


def test_backup_command_writes_a_private_file_and_says_so(app, filled, tmp_path):
    path = tmp_path / "chosen" / "site.json"
    result = app.test_cli_runner().invoke(args=["backup", "--to", str(path)])
    assert result.exit_code == 0, result.output
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert str(path) in result.output
    assert "personal data and password hashes" in result.output
    assert "mode 600" in result.output
    assert read_backup(path)["tables"] == backup_of(app)["tables"]


def test_backup_command_defaults_to_the_ignored_instance_folder(app, filled, tmp_path, freeze):
    freeze("2026-11-24T08:15:00")
    app.instance_path = str(tmp_path / "instance")
    result = app.test_cli_runner().invoke(args=["backup"])
    assert result.exit_code == 0, result.output
    path = tmp_path / "instance" / "backups" / "quadra-20261124-081500.json"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert read_backup(path)["created_at"] == "2026-11-24T08:15:00+00:00"


def test_backup_command_never_overwrites_a_file(app, filled, tmp_path):
    path = tmp_path / "site.json"
    path.write_text("keep me")
    result = app.test_cli_runner().invoke(args=["backup", "--to", str(path)])
    assert result.exit_code != 0
    assert "already exists" in result.output
    assert path.read_text() == "keep me"


def test_restore_command_loads_a_backup_file(app, filled, tmp_path):
    path = tmp_path / "site.json"
    runner = app.test_cli_runner()
    runner.invoke(args=["backup", "--to", str(path)])
    before = backup_of(app)
    emptied(app)
    result = runner.invoke(args=["restore", str(path)])
    assert result.exit_code == 0, result.output
    assert "Restored" in result.output
    assert backup_of(app)["tables"] == before["tables"]


def test_restore_command_refuses_a_filled_database_without_force(app, filled, tmp_path):
    path = tmp_path / "site.json"
    runner = app.test_cli_runner()
    runner.invoke(args=["backup", "--to", str(path)])
    refused = runner.invoke(args=["restore", str(path)])
    assert refused.exit_code != 0
    assert "already has rows" in refused.output
    assert runner.invoke(args=["restore", str(path), "--force"]).exit_code == 0


def test_restore_command_needs_its_own_flag_in_production(make_app, tmp_path):
    app = emptied(make_app(PRODUCTION))
    fill_every_table(app)
    path = tmp_path / "site.json"
    runner = app.test_cli_runner()
    assert runner.invoke(args=["backup", "--to", str(path)]).exit_code == 0
    before = backup_of(app)
    emptied(app)
    refused = runner.invoke(args=["restore", str(path)])
    assert refused.exit_code != 0
    assert "--production" in refused.output
    assert count(app, "attendees") == 0
    still_refused = runner.invoke(args=["restore", str(path), "--force"])
    assert still_refused.exit_code != 0
    allowed = runner.invoke(args=["restore", str(path), "--production"])
    assert allowed.exit_code == 0, allowed.output
    assert backup_of(app)["tables"] == before["tables"]


def test_database_is_named_without_its_password(app):
    app.config["DATABASE_URL"] = "postgresql://quadra_app:s3cret-pass@db.example.com:6543/postgres"
    with app.app_context():
        assert database_name() == "the Postgres database postgres on db.example.com"


def test_init_db_and_migrate_can_skip_the_first_event(app):
    runner = app.test_cli_runner()
    assert runner.invoke(args=["init-db", "--force", "--no-event"]).exit_code == 0
    assert count(app, "events") == 0
    assert runner.invoke(args=["migrate", "--no-event"]).exit_code == 0
    assert count(app, "events") == 0
    assert runner.invoke(args=["migrate"]).exit_code == 0
    assert count(app, "events") == 1


def test_postgres_backup_restores_into_sqlite(app, filled, tmp_path, postgres_url):
    if not postgres_url:
        pytest.skip("needs a postgres database to back up")
    backup = backup_of(app)
    laptop = sqlite_app(tmp_path, "rehearsal.db")
    restore_into(laptop, backup)
    assert backup_of(laptop)["tables"] == backup["tables"]
    assert backup_of(laptop)["last_ids"] == backup["last_ids"]
    client = signed_in_owner(laptop)
    with laptop.app_context():
        waiting = get_attendee_by_code(filled["waiting"])
    assert "CHECKED IN" in client.get(f"/checkin/{waiting['ticket_token']}").get_data(as_text=True).upper()


def test_sqlite_backup_restores_into_postgres(app, tmp_path, postgres_url):
    if not postgres_url:
        pytest.skip("needs a postgres database to restore into")
    laptop = sqlite_app(tmp_path, "source.db")
    codes = fill_every_table(laptop)
    backup = backup_of(laptop)
    restore_into(emptied(app), backup)
    assert backup_of(app)["tables"] == backup["tables"]
    client = signed_in_owner(app)
    with app.app_context():
        waiting = get_attendee_by_code(codes["waiting"])
        later = create_attendee(1, "Pedro Penduko", "pedro@example.com", "PUP", "+639191234567")
    assert later["id"] == 3
    assert "CHECKED IN" in client.get(f"/checkin/{waiting['ticket_token']}").get_data(as_text=True).upper()


def test_backup_works_before_the_newest_migration_is_applied(app, filled):
    with app.app_context():
        get_db().execute("DROP TABLE error_alerts")
        get_db().execute("DELETE FROM schema_migrations WHERE name = %s", ("0007_error_alerts.sql",))
        get_db().commit()
    backup = backup_of(app)
    assert "error_alerts" not in backup["tables"]
    assert "0007_error_alerts.sql" not in backup["migrations"]
    assert len(backup["tables"]["attendees"]) > 0
    assert len(backup["tables"]["accounts"]) > 0
