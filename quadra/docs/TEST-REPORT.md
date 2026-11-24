# Test Report

Quadra, tested on November 24, 2026 on a MacBook (macOS, Python
3.12, Chrome) and an iPhone on the same Wi-Fi.

## Summary

| Step | Assignment part | Result |
| --- | --- | --- |
| 1 | Registration Form | Passed |
| 2 | Database and QR Script | Passed |
| 3 | Automated Email | Passed |
| 4 | Check-in Scanner | Passed |

Automated tests: `pytest` ran 562 tests on each database: 561 passed with 1 skipped on SQLite, and 561 passed with 1 skipped on Postgres 16. `ruff check .` reported no issues.

| Test file | Tests | Covers |
| --- | --- | --- |
| `tests/test_registration.py` | 33 | form, saving, duplicates, attendee codes, CSRF |
| `tests/test_events.py` | 36 | landing page, several events, registration opening dates, adding events |
| `tests/test_event_management.py` | 156 | event states, drafts, closing, editing, deleting, staff-only and CSRF checks |
| `tests/test_validation.py` | 10 | phone number formats |
| `tests/test_health.py` | 1 | health check |
| `tests/test_qr.py` | 20 | QR content, ticket image, ticket download, caching, image failures |
| `tests/test_mailer.py` | 26 | email content, attachment, failures, resend-ticket, invite and password emails |
| `tests/test_accounts.py` | 106 | login, lockout, sessions, one-time links, forgot password, account page, create-owner |
| `tests/test_team.py` | 37 | owner-only team page, invites, disable and enable, last-owner protection |
| `tests/test_checkin.py` | 50 | check-in, who checked in, scanner API, admin, CSV export |
| `tests/test_db.py` | 13 | SQLite and Postgres connection, portable queries |
| `tests/test_migrations.py` | 15 | schema upgrades that keep existing data, row level security |
| `tests/test_clock.py` | 13 | UTC storage, Manila display |
| `tests/test_security.py` | 23 | production mode, cookies, security headers, proxy trust |
| `tests/test_errors.py` | 17 | error pages and API errors |

The end-to-end run and the phone test below were done before the site was redesigned, before it
supported several events, and while each ticket was still saved as a PNG file in
`instance/qrcodes/`. Tickets are now built in memory and no ticket file is written to disk. Staff
also signed in with one shared PIN then. That PIN has been replaced by a personal account with an
email and password for each staff member, so the PIN steps below describe the earlier version.
The automated tests cover the current version.

## End-to-end run

The database was backed up and replaced with an empty one, then three new attendees went through
the whole flow.

| Code | Name | Email | QR created | Email | Checked in | Checked in by |
| --- | --- | --- | --- | --- | --- | --- |
| SEM-2026-0001 | Ana Reyes | lawrencepanes8+demo1@gmail.com | Yes | sent 18:23:12 | 18:24:13 | Webcam feed on `/scanner` |
| SEM-2026-0002 | Miguel Santos | lawrencepanes8+demo2@gmail.com | Yes | sent 18:23:17 | 18:23:38 | Ticket link `/checkin/<token>` |
| SEM-2026-0003 | Carla Dizon | lawrencepanes8+demo3@gmail.com | Yes | sent 18:23:21 | 18:24:56 | Typed into `/scanner`, as a USB scanner does |

Dashboard after the run: Registered 3, Emails sent 3, Checked in 3.

## Step 1: Registration Form

**What the assignment asks:** a form that collects the attendee's details and saves them.

**What was done:** opened the form in Chrome and registered three attendees with a full name,
email, organization, and contact number. Also submitted the form with an empty email.

**Result:** passed. Each registration went to its confirmation page with a new attendee code.
The empty email was rejected with "Email address is required." and the other fields kept their
values. The number `09171230001` was saved as `+639171230001`.

![Registration form](../screenshots/01-registration-form.png)

![Confirmation page](../screenshots/02-registration-confirmation.png)

## Step 2: Database and QR Script

**What the assignment asks:** each new entry is stored and gets its own QR code.

**What was done:** read the three rows from `instance/seminar.db` and the files in
`instance/qrcodes/`. Decoded each QR image and compared it with the row's ticket token.

**Result:** passed. Every row has a unique attendee code and ticket token. Three PNG files were
created, one per attendee, and each QR decodes to `PUBLIC_BASE_URL/checkin/<ticket_token>` for
its own row.

![Database rows](../screenshots/03-database-row.png)

## Step 3: Automated Email

**What the assignment asks:** the QR ticket is emailed to the attendee automatically.

**What was done:** registered with `MAIL_ENABLED=true` and a Gmail App Password. Checked the app
log, the `email_status` column, and the receiving inbox. Ran `resend-ticket` for one attendee.

**Result:** passed. The log shows each ticket sent in about 4 seconds, and every row has
`email_status = sent` with a time. The email arrived with the subject "Your ticket: Tech
Innovators Seminar 2026", the QR shown in the body, and the PNG attached. `resend-ticket` sent a
second copy.

![Ticket email](../screenshots/04-ticket-email.png)

## Step 4: Check-in Scanner

**What the assignment asks:** scanning the QR with a scanning app on a smartphone marks the
attendee as checked in.

**What was done:**

1. Ran the app with `--host 0.0.0.0` and set `PUBLIC_BASE_URL` to the laptop's Wi-Fi address.
2. Scanned an emailed ticket with the iPhone camera, opened the link, and entered the staff PIN.
3. Opened the same ticket link a second time.
4. Scanned a ticket on `/scanner` with a webcam feed, and typed another ticket's code into the
   scanner box.
5. Entered a wrong PIN, and opened a check-in link with a made-up token.

**Result:** passed. The phone scan was done on the earlier test database, before the clean run
above, so its attendee name differs from the table.

| Check | Result |
| --- | --- |
| Phone scan, not logged in | Sent to the login page, then back to the ticket |
| Phone scan, logged in | Green "CHECKED IN: Lawrence Panes (SEM-2026-0002)", row set to `checked_in = 1` |
| Same ticket again | Amber "ALREADY CHECKED IN at" the first time, which stayed unchanged |
| Made-up token | Red "INVALID TICKET" |
| Webcam on `/scanner` | Green card, reset after 2 seconds |
| Typed code on `/scanner` | Green card |
| Wrong PIN | "Wrong PIN." and no access |
| Dashboard totals | Matched the database |

![Phone check-in](../screenshots/05-phone-checked-in.png)

![Scanner page](../screenshots/06-scanner-page.png)

![Admin dashboard](../screenshots/07-admin-dashboard.png)
